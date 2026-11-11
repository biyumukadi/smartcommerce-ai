import { prisma } from "@/lib/db";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import { requireStoreAccess } from "@/lib/tenant";

type Params = { params: Promise<{ storeId: string; jobId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const rid = withRequestId();
  const { storeId, jobId } = await params;
  try {
    const session = await requireSession();
    await requireStoreAccess(session.user.id, storeId, "ads:write");
    const job = await prisma.aIJob.findFirst({
      where: { id: jobId, storeId },
      include: { creatives: true },
    });
    if (!job) throw new Error("Job introuvable");
    return jsonOk({ job }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid, storeId });
  }
}
