/** USDC (6-decimal) formatting/parsing helpers. Base units travel as strings. */

const DECIMALS = 6;
const UNIT = 1_000_000n;

/** "1234567" → "1.23" (maxDecimals=2). Pass maxDecimals=6 for full precision. */
export function formatUsdc(baseUnits: string, maxDecimals = 2): string {
  const n = BigInt(baseUnits || "0");
  const whole = n / UNIT;
  const frac = n % UNIT;
  const fracStr = frac
    .toString()
    .padStart(DECIMALS, "0")
    .slice(0, maxDecimals)
    .replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : `${whole}.00`;
}

/** "1.5" → "1500000". Returns null on invalid input (caller shows an error). */
export function parseUsdc(input: string): string | null {
  const v = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(v)) return null;
  const [whole, frac = ""] = v.split(".");
  const base =
    BigInt(whole) * UNIT + BigInt((frac + "000000").slice(0, DECIMALS));
  return base.toString();
}

/** "0x34964ded4C80F8F13495095757C7EeA81C8636b4" → "0x3496…36b4" */
export function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function isEvmAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}
