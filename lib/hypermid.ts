/**
 * Server-side Hypermid API client. Imported ONLY from app/api route handlers —
 * this module holds HYPERMID_SK and must never reach the client bundle.
 *
 * Every call maps to the "merchant creates a session server-side" step of the
 * real integration pattern; the returned session id is all the browser ever sees.
 */

const API_URL =
  process.env.NEXT_PUBLIC_HYPERMID_API_URL ?? "https://server.hypermid.io";

// ── Demo constants ────────────────────────────────────────────────────────────
export const CHAIN_ID = 8453; // Base
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base

/** Omnibus treasury — allowlisted on the partner account (payout allowlist, A4).
 *  All demo deposits settle here; per-user attribution rides in orderId/metadata. */
export const TREASURY_ADDRESS = "0x34964ded4C80F8F13495095757C7EeA81C8636b4";

/** Hardcoded exposure caps (USDC base units, 6 decimals). Belt-and-suspenders:
 *  enforced here server-side AND passed to the API as maxAmount/amount. */
export const MAX_DEPOSIT_BASE = "5000000"; // 5 USDC
export const MAX_WITHDRAW_BASE = "2000000"; // 2 USDC

const SESSION_TTL_SECONDS = 3600;

interface CreateSessionResult {
  /** The `co_…` session id the widget embeds. */
  id: string;
  expiresAt: number | null;
}

async function createSession(
  path: "/v1/payments/deposit" | "/v1/payments/withdrawal",
  body: Record<string, unknown>,
): Promise<CreateSessionResult> {
  const sk = process.env.HYPERMID_SK;
  if (!sk) throw new Error("HYPERMID_SK is not configured on the server");

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${sk}`,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as {
    data?: { id?: string; expiresAt?: number };
    error?: { message?: string } | string;
  } | null;

  const id = json?.data?.id;
  if (!res.ok || !id) {
    const msg =
      (typeof json?.error === "object" ? json.error?.message : json?.error) ??
      `Hypermid API error (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return { id, expiresAt: json?.data?.expiresAt ?? null };
}

/**
 * Deposit session — open-sized up to MAX_DEPOSIT_BASE. The payer chooses the
 * amount (≤ $5) inside the widget; funds settle to the omnibus treasury.
 */
export function createDepositSession(opts: {
  privyUserId: string;
}): Promise<CreateSessionResult> {
  return createSession("/v1/payments/deposit", {
    token: USDC_BASE,
    chain: CHAIN_ID,
    recipient: TREASURY_ADDRESS,
    orderId: `demo_dep_${crypto.randomUUID()}`,
    maxAmount: MAX_DEPOSIT_BASE,
    expiresIn: SESSION_TTL_SECONDS,
    metadata: { app: "hypermid-demo-perp", privyUserId: opts.privyUserId },
  });
}

/**
 * Withdrawal session — fixed `amount` to a user-supplied destination. The
 * destination is NOT allowlisted on Hypermid's side (by design, CR-283 B):
 * the connecting wallet's signing preview is the authorization gate, and the
 * signing wallet is the source of funds. We re-validate the cap server-side
 * before ever calling the API.
 */
export function createWithdrawalSession(opts: {
  privyUserId: string;
  destination: string;
  amountBase: string;
}): Promise<CreateSessionResult> {
  if (BigInt(opts.amountBase) <= 0n) {
    throw new Error("Amount must be greater than zero");
  }
  if (BigInt(opts.amountBase) > BigInt(MAX_WITHDRAW_BASE)) {
    throw new Error("Amount exceeds the 2 USDC demo cap");
  }
  return createSession("/v1/payments/withdrawal", {
    token: USDC_BASE,
    chain: CHAIN_ID,
    recipient: opts.destination,
    amount: opts.amountBase,
    orderId: `demo_wd_${crypto.randomUUID()}`,
    expiresIn: SESSION_TTL_SECONDS,
    metadata: { app: "hypermid-demo-perp", privyUserId: opts.privyUserId },
  });
}
