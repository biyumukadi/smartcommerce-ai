import { requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import {
  buildReceiptPdf,
  getOrderReceiptData,
} from "@/lib/commerce/receipts";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";

type Params = { params: Promise<{ storeId: string; orderId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId, orderId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const data = await getOrderReceiptData(storeId, orderId);
    const pdf = buildReceiptPdf(data);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="receipt-${data.orderNumber}.pdf"`,
        "X-Request-Id": rid,
      },
    });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
