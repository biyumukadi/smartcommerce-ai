import { z } from "zod";
import { jsonError, jsonOk, requireSession, withRequestId } from "@/lib/api";
import {
  assertRateLimit,
  beginMfaSetup,
  confirmMfaSetup,
  requireSameOrigin,
  verifyUserMfa,
} from "@/lib/security";
import { prisma } from "@/lib/db";

export async function GET() {
  const rid = withRequestId();
  try {
    const session = await requireSession();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.user!.id! },
      select: {
        mfaEnabled: true,
        mfaVerifiedAt: true,
        isPlatformAdmin: true,
      },
    });
    return jsonOk({ mfa: user }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin") }),
  z.object({ action: z.literal("confirm"), token: z.string().min(6) }),
  z.object({ action: z.literal("verify"), token: z.string().min(6) }),
]);

export async function POST(req: Request) {
  const rid = withRequestId();
  try {
    requireSameOrigin(req);
    const session = await requireSession();
    await assertRateLimit({
      key: `mfa:${session.user!.id}`,
      limit: 20,
      windowSec: 60,
    });
    const body = schema.parse(await req.json());
    if (body.action === "begin") {
      const setup = await beginMfaSetup(session.user!.id!);
      return jsonOk(
        {
          ...setup,
          notice:
            "Scannez le secret TOTP puis confirmez avec un code. Secret chiffré côté serveur.",
        },
        { requestId: rid },
      );
    }
    if (body.action === "confirm") {
      const user = await confirmMfaSetup(session.user!.id!, body.token);
      return jsonOk(
        { mfaEnabled: user.mfaEnabled, mfaVerifiedAt: user.mfaVerifiedAt },
        { requestId: rid },
      );
    }
    await verifyUserMfa(session.user!.id!, body.token);
    return jsonOk({ verified: true }, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
