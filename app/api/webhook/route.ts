import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

/**
 * POST /api/webhook — Hypermid event receiver (phase 2 stub).
 *
 * Hypermid signs deliveries Stripe-style: `X-Hypermid-Signature: t=<ts>,v1=<hex>`
 * where v1 = HMAC_SHA256(secret, "<t>.<raw body>"). The MVP balance rides on
 * the widget's onSuccess callback instead; this route exists so the
 * verification pattern is already in place — phase 2 swaps the TODO below for
 * a Supabase ledger write and this becomes the balance source of truth.
 *
 * Unset HYPERMID_WEBHOOK_SECRET → 503: the route accepts nothing silently.
 * The path is excluded from basic auth (middleware.ts) so Hypermid can reach it.
 */
export async function POST(req: Request) {
  const secret = process.env.HYPERMID_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 503 },
    );
  }

  const raw = await req.text();
  const header = req.headers.get("x-hypermid-signature") ?? "";
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) {
    return NextResponse.json({ error: "Malformed signature header" }, { status: 401 });
  }

  // Replay guard: reject deliveries older than 5 minutes.
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) {
    return NextResponse.json({ error: "Stale signature" }, { status: 401 });
  }

  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(raw) as {
    event?: string;
    data?: { orderId?: string; destinationWallet?: string; paidAmount?: string };
  };

  // TODO phase 2: switch (event.event) {
  //   case "deposit.completed":    credit ledger by event.data.orderId → privyUserId (metadata)
  //   case "withdrawal.completed": debit ledger; VERIFY event.data.destinationWallet
  //                                against your own dispatch record (destination is
  //                                not allowlisted on Hypermid's side — CR-283 B)
  // }
  console.log("[webhook] verified:", event.event, event.data?.orderId ?? "");

  return NextResponse.json({ received: true });
}
