import { NextResponse } from "next/server";
import { verifyPrivyRequest } from "@/lib/privy-server";
import { createWithdrawalSession } from "@/lib/hypermid";
import { isEvmAddress, parseUsdc } from "@/lib/formatting";

/**
 * POST /api/create-withdrawal
 * Auth: Privy user JWT (see create-deposit).
 * Body: { destination: "0x…", amount: "1.50" } (human USDC, capped at 2).
 *
 * The destination is user-supplied and NOT allowlisted on Hypermid's side —
 * by design (CR-283 B): the signing wallet's preview is the authorization gate.
 */
export async function POST(req: Request) {
  const userId = await verifyPrivyRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    destination?: unknown;
    amount?: unknown;
  } | null;
  const destination = typeof body?.destination === "string" ? body.destination.trim() : "";
  const amount = typeof body?.amount === "string" ? body.amount : "";

  if (!isEvmAddress(destination)) {
    return NextResponse.json({ error: "Invalid destination address" }, { status: 400 });
  }
  const amountBase = parseUsdc(amount);
  if (amountBase === null || BigInt(amountBase) <= 0n) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  try {
    const session = await createWithdrawalSession({
      privyUserId: userId,
      destination,
      amountBase,
    });
    return NextResponse.json({
      checkoutId: session.id,
      expiresAt: session.expiresAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create withdrawal";
    const status = msg.includes("cap") ? 400 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
