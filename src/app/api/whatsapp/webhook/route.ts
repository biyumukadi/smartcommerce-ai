import { NextResponse } from "next/server";
import { jsonError, jsonOk, withRequestId } from "@/lib/api";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { processWhatsAppWebhookBody } from "@/lib/messaging/inbound";

/** Meta webhook verification (GET) */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = getWhatsAppProvider();
  const challenge = provider.verifyChallenge?.({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
  });
  if (challenge == null) {
    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
  }
  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

/** Inbound messages / status updates (POST) */
export async function POST(req: Request) {
  const rid = withRequestId();
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-hub-signature-256") ||
      req.headers.get("x-sc-signature");

    const result = await processWhatsAppWebhookBody({
      rawBody,
      signature,
    });

    return jsonOk(result, { requestId: rid });
  } catch (error) {
    return jsonError(error, { requestId: rid });
  }
}
