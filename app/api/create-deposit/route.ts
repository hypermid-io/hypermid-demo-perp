import { NextResponse } from "next/server";
import { verifyPrivyRequest } from "@/lib/privy-server";
import { createDepositSession } from "@/lib/hypermid";

/**
 * POST /api/create-deposit
 * Auth: Privy user JWT (Authorization: Bearer <token>) — mandatory even though
 * the site sits behind basic auth; HYPERMID_SK must never be reachable without
 * a valid user session.
 *
 * Creates an open-sized deposit session (≤ 5 USDC) settling to the omnibus
 * treasury; the browser only ever receives the session id.
 */
export async function POST(req: Request) {
  const userId = await verifyPrivyRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const session = await createDepositSession({ privyUserId: userId });
    return NextResponse.json({
      checkoutId: session.id,
      expiresAt: session.expiresAt,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create deposit" },
      { status: 502 },
    );
  }
}
