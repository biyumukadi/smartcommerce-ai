import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { defaultLocale, locales } from "./i18n/request";
import { SECURITY_HEADERS } from "./lib/security/csrf";

const intlMiddleware = createMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: "always",
});

function withSecurityHeaders(res: NextResponse) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

export default function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-store");
    return withSecurityHeaders(res);
  }
  const res = intlMiddleware(req);
  return withSecurityHeaders(
    res instanceof NextResponse ? res : NextResponse.next(),
  );
}

export const config = {
  matcher: ["/", "/(fr|en)/:path*", "/((?!_next|_vercel|.*\\..*).*)"],
};
