/**
 * Client-side balance store (MVP). localStorage, keyed by Privy user id so
 * multiple demo users on one browser don't share a balance. Values are USDC
 * base units (6 decimals) as decimal strings — BigInt math, never floats.
 *
 * Phase 2 replaces this with webhook-driven server persistence (Supabase);
 * see README "Phase 2".
 */

const PREFIX = "demo_perp_balance_v1:";

export function getBalance(userId: string): string {
  if (typeof window === "undefined") return "0";
  return window.localStorage.getItem(PREFIX + userId) ?? "0";
}

export function setBalance(userId: string, baseUnits: string): void {
  window.localStorage.setItem(PREFIX + userId, baseUnits);
}

/** Adds delta (base units) and returns the new balance. */
export function addToBalance(userId: string, deltaBase: string): string {
  const next = BigInt(getBalance(userId)) + BigInt(deltaBase);
  const value = next.toString();
  setBalance(userId, value);
  return value;
}

/** Subtracts delta (base units), clamped at zero, and returns the new balance. */
export function subtractFromBalance(userId: string, deltaBase: string): string {
  const current = BigInt(getBalance(userId));
  const next = current - BigInt(deltaBase);
  const value = (next < 0n ? 0n : next).toString();
  setBalance(userId, value);
  return value;
}

export function clearBalance(userId: string): void {
  window.localStorage.removeItem(PREFIX + userId);
}
