import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";
import {
  createComplaint,
  listComplaints,
  updateComplaintStatus,
} from "@/lib/crm";

type Params = { params: Promise<{ storeId: string }> };

export async function GET(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId);
    const status = new URL(req.url).searchParams.get("status") as
      | "open"
      | "in_progress"
      | "resolved"
      | "closed"
      | null;
    const complaints = await listComplaints(storeId, status || undefined);
    return jsonOk({ complaints }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}

const createSchema = z.object({
  customerId: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  orderId: z.string().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "orders:write");
    const body = createSchema.parse(await req.json());
    const complaint = await createComplaint({ storeId, ...body });
    return jsonOk({ complaint }, { status: 201, requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}

const patchSchema = z.object({
  complaintId: z.string().min(1),
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
  resolution: z.string().optional(),
  assignedTo: z.string().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user!.id!, storeId, "orders:write");
    const body = patchSchema.parse(await req.json());
    const complaint = await updateComplaintStatus({ storeId, ...body });
    return jsonOk({ complaint }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
