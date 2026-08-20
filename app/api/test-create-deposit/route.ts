import { NextResponse } from "next/server";
import { createDepositSession } from "@/lib/hypermid";

/**
 * POST /api/test-create-deposit
 * No auth — creates a deposit session for bridge testing only.
 * This route is NOT for production use.
 */
export async function POST() {
  try {
    const session = await createDepositSession({
      privyUserId: "test_user_" + Date.now(),
    });
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
