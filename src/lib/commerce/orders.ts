import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

function nextOrderNumber(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.floor(Math.random() * 900 + 100);
  return `SC-${stamp}-${rand}`;
}

export async function createOrderFromCart(input: {
  storeId: string;
  cartId: string;
  shippingAddress: Prisma.InputJsonValue;
  customer?: { email?: string; phone?: string; name?: string };
  notes?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: input.cartId, storeId: input.storeId, status: "open" },
      include: {
        items: {
          include: {
            variant: {
              include: { product: true, inventory: true },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new Error("Panier vide ou introuvable");
    }

    for (const item of cart.items) {
      const inv = item.variant.inventory;
      if (!inv) throw new Error(`Stock manquant pour ${item.variant.sku}`);
      const available = inv.quantityOnHand - inv.quantityReserved;
      if (available < item.quantity) {
        throw new Error(`Stock insuffisant pour ${item.variant.sku}`);
      }
    }

    let customerId = cart.customerId;
    if (!customerId && (input.customer?.email || input.customer?.phone)) {
      const customer = await tx.customer.create({
        data: {
          storeId: input.storeId,
          email: input.customer.email?.toLowerCase(),
          phone: input.customer.phone,
          name: input.customer.name,
        },
      });
      customerId = customer.id;
    }

    const subtotal = cart.items.reduce(
      (sum, i) => sum + Number(i.unitPriceAmount) * i.quantity,
      0,
    );

    const order = await tx.order.create({
      data: {
        storeId: input.storeId,
        customerId,
        orderNumber: nextOrderNumber(),
        status: "awaiting_payment",
        paymentStatus: "pending",
        fulfillmentStatus: "unfulfilled",
        currency: cart.currency,
        subtotalAmount: subtotal,
        shippingAmount: 0,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: subtotal,
        shippingAddress: input.shippingAddress,
        notes: input.notes,
        placedAt: new Date(),
        items: {
          create: cart.items.map((item) => ({
            storeId: input.storeId,
            variantId: item.variantId,
            productName: item.variant.product.name as Prisma.InputJsonValue,
            sku: item.variant.sku,
            quantity: item.quantity,
            unitPriceAmount: item.unitPriceAmount,
            currency: item.currency,
            totalAmount: Number(item.unitPriceAmount) * item.quantity,
          })),
        },
      },
      include: { items: true },
    });

    for (const item of cart.items) {
      await tx.inventory.update({
        where: { variantId: item.variantId },
        data: { quantityReserved: { increment: item.quantity } },
      });
    }

    await tx.cart.update({
      where: { id: cart.id },
      data: { status: "converted", customerId },
    });

    logger.info("order.created", {
      storeId: input.storeId,
      orderId: order.id,
      orderNumber: order.orderNumber,
    });

    return order;
  });
}

export async function markOrderPaid(input: {
  storeId: string;
  orderId: string;
  paymentId: string;
  providerRef: string;
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: input.orderId, storeId: input.storeId },
      include: { items: true },
    });
    if (!order) throw new Error("Order not found");
    if (order.paymentStatus === "paid") {
      return order; // idempotent
    }

    await tx.payment.update({
      where: { id: input.paymentId },
      data: {
        status: "succeeded",
        providerRef: input.providerRef,
        paidAt: new Date(),
      },
    });

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "paid",
        paymentStatus: "paid",
      },
    });

    for (const item of order.items) {
      if (!item.variantId) continue;
      await tx.inventory.updateMany({
        where: { variantId: item.variantId, storeId: input.storeId },
        data: {
          quantityOnHand: { decrement: item.quantity },
          quantityReserved: { decrement: item.quantity },
        },
      });
    }

    logger.info("order.paid", {
      storeId: input.storeId,
      orderId: order.id,
      paymentId: input.paymentId,
    });

    return updated;
  });
}
