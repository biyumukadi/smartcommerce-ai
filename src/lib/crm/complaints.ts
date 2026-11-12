import { prisma } from "@/lib/db";
import type { ComplaintStatus } from "@prisma/client";

export async function createComplaint(input: {
  storeId: string;
  customerId: string;
  subject: string;
  body: string;
  orderId?: string;
}) {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, storeId: input.storeId },
  });
  if (!customer) throw new Error("Client introuvable");
  if (!input.subject.trim() || !input.body.trim()) {
    throw new Error("Sujet et détail requis");
  }

  return prisma.complaint.create({
    data: {
      storeId: input.storeId,
      customerId: input.customerId,
      orderId: input.orderId,
      subject: input.subject.trim(),
      body: input.body.trim(),
      status: "open",
    },
  });
}

export async function updateComplaintStatus(input: {
  storeId: string;
  complaintId: string;
  status: ComplaintStatus;
  resolution?: string;
  assignedTo?: string;
}) {
  const existing = await prisma.complaint.findFirst({
    where: { id: input.complaintId, storeId: input.storeId },
  });
  if (!existing) throw new Error("Réclamation introuvable");

  return prisma.complaint.update({
    where: { id: existing.id },
    data: {
      status: input.status,
      resolution: input.resolution ?? existing.resolution,
      assignedTo: input.assignedTo ?? existing.assignedTo,
      resolvedAt:
        input.status === "resolved" || input.status === "closed"
          ? new Date()
          : existing.resolvedAt,
    },
  });
}

export async function listComplaints(
  storeId: string,
  status?: ComplaintStatus,
) {
  return prisma.complaint.findMany({
    where: {
      storeId,
      ...(status ? { status } : {}),
    },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
