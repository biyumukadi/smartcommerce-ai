import { prisma } from "@/lib/db";
import { fromMinor } from "@/lib/money";

type ReceiptOrder = {
  orderNumber: string;
  currency: string;
  totalAmount: number;
  subtotalAmount: number;
  shippingAmount: number;
  taxAmount: number;
  discountAmount: number;
  status: string;
  paymentStatus: string;
  placedAt: Date | null;
  createdAt: Date;
  storeName: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  shippingAddress?: unknown;
  items: Array<{
    sku: string;
    quantity: number;
    unitPriceAmount: number;
    totalAmount: number;
    productName: unknown;
  }>;
  payments: Array<{
    provider: string;
    method: string;
    status: string;
    amount: number;
    currency: string;
    providerRef?: string | null;
    paidAt?: Date | null;
  }>;
};

function productLabel(name: unknown): string {
  if (name && typeof name === "object" && "fr" in (name as object)) {
    return String((name as { fr?: string; en?: string }).fr || (name as { en?: string }).en || "Produit");
  }
  return "Produit";
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Minimal single-page PDF receipt (no external deps). */
export function buildReceiptPdf(order: ReceiptOrder): Buffer {
  const lines: string[] = [
    "SmartCommerce AI — Reçu / Receipt",
    `Commande: ${order.orderNumber}`,
    `Boutique: ${order.storeName}`,
    `Date: ${(order.placedAt || order.createdAt).toISOString()}`,
    `Statut: ${order.status} / paiement ${order.paymentStatus}`,
    `Client: ${order.customerName || "—"} ${order.customerPhone || ""} ${order.customerEmail || ""}`.trim(),
    "--- Articles ---",
  ];

  for (const item of order.items) {
    lines.push(
      `${productLabel(item.productName)} [${item.sku}] x${item.quantity} = ${fromMinor(item.totalAmount).toFixed(2)} ${order.currency}`,
    );
  }

  lines.push("--- Totaux ---");
  lines.push(`Sous-total: ${fromMinor(order.subtotalAmount).toFixed(2)} ${order.currency}`);
  if (order.shippingAmount)
    lines.push(`Livraison: ${fromMinor(order.shippingAmount).toFixed(2)} ${order.currency}`);
  if (order.taxAmount)
    lines.push(`Taxes: ${fromMinor(order.taxAmount).toFixed(2)} ${order.currency}`);
  if (order.discountAmount)
    lines.push(`Remise: ${fromMinor(order.discountAmount).toFixed(2)} ${order.currency}`);
  lines.push(`TOTAL: ${fromMinor(order.totalAmount).toFixed(2)} ${order.currency}`);
  lines.push("--- Paiements ---");

  for (const p of order.payments) {
    lines.push(
      `${p.provider}/${p.method}: ${p.status} ${fromMinor(p.amount).toFixed(2)} ${p.currency}${p.providerRef ? ` (${p.providerRef})` : ""}`,
    );
  }

  lines.push("Document généré par SmartCommerce AI (MVP+).");

  const contentLines = lines
    .map((line, i) => `BT /F1 10 Tf 40 ${780 - i * 14} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");

  const stream = contentLines;
  const objects: string[] = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj");
  objects.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj",
  );
  objects.push(
    `4 0 obj<< /Length ${Buffer.byteLength(stream, "utf8")} >>stream\n${stream}\nendstream endobj`,
  );
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj + "\n";
  }
  const xrefPos = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export async function getOrderReceiptData(storeId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, storeId },
    include: {
      items: true,
      payments: { orderBy: { createdAt: "asc" } },
      customer: true,
      store: true,
    },
  });
  if (!order) throw new Error("Commande introuvable");

  return {
    orderNumber: order.orderNumber,
    currency: order.currency,
    totalAmount: Number(order.totalAmount),
    subtotalAmount: Number(order.subtotalAmount),
    shippingAmount: Number(order.shippingAmount),
    taxAmount: Number(order.taxAmount),
    discountAmount: Number(order.discountAmount),
    status: order.status,
    paymentStatus: order.paymentStatus,
    placedAt: order.placedAt,
    createdAt: order.createdAt,
    storeName: order.store.name,
    customerName: order.customer?.name,
    customerPhone: order.customer?.phone,
    customerEmail: order.customer?.email,
    shippingAddress: order.shippingAddress,
    items: order.items.map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
      unitPriceAmount: Number(item.unitPriceAmount),
      totalAmount: Number(item.totalAmount),
      productName: item.productName,
    })),
    payments: order.payments.map((p) => ({
      provider: p.provider,
      method: p.method,
      status: p.status,
      amount: Number(p.amount),
      currency: p.currency,
      providerRef: p.providerRef,
      paidAt: p.paidAt,
    })),
  } satisfies ReceiptOrder;
}
