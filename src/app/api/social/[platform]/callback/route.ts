import { NextResponse } from "next/server";
import { completeSocialOAuth, parseOAuthState } from "@/lib/social/connections";
import { logger } from "@/lib/logger";

type Params = { params: Promise<{ platform: string }> };

export async function GET(req: Request, { params }: Params) {
  const { platform } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  try {
    if (platform !== "meta" && platform !== "tiktok") {
      throw new Error("Invalid platform");
    }
    if (err) {
      throw new Error(`OAuth error: ${err}`);
    }
    if (!code || !state) {
      throw new Error("code/state manquants");
    }
    const parsed = parseOAuthState(state);
    await completeSocialOAuth({ platform, code, state });
    return NextResponse.redirect(
      `${appUrl}/fr/dashboard/social?connected=${platform}&storeId=${parsed.storeId}`,
    );
  } catch (error) {
    logger.error("social.oauth_callback_failed", {
      platform,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.redirect(
      `${appUrl}/fr/dashboard/social?error=${encodeURIComponent(
        error instanceof Error ? error.message : "oauth_failed",
      )}`,
    );
  }
}
