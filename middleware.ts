import { NextRequest, NextResponse } from "next/server";

/**
 * Site-wide basic auth for the pilot (prevents random discovery while iterating).
 *
 * `/api/*` is deliberately EXCLUDED: each API route carries its own auth —
 * /api/create-* verifies a Privy user JWT (see lib/privy-server.ts) and
 * /api/webhook verifies the Hypermid HMAC signature. Basic auth on those
 * routes would break the Bearer token flow and server-to-server webhooks.
 *
 * Unset MIDDLEWARE_PASSWORD → middleware is a no-op (local dev convenience).
 * Always set it in the deployed environment.
 */
export function middleware(req: NextRequest) {
  const password = process.env.MIDDLEWARE_PASSWORD;
  if (!password) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const pass = decoded.slice(decoded.indexOf(":") + 1);
      if (pass === password) return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="hypermid-demo-perp"' },
  });
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
