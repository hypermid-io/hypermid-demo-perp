/**
 * Server-side Privy verification. The /api/create-* routes call this before
 * touching HYPERMID_SK — a valid Privy user JWT is mandatory, so the secret
 * key is never reachable by an unauthenticated caller (even if the site-wide
 * basic auth is bypassed or disabled).
 */
import { PrivyClient } from "@privy-io/server-auth";

let client: PrivyClient | null = null;

function getClient(): PrivyClient {
  if (!client) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error("Privy server env not configured (NEXT_PUBLIC_PRIVY_APP_ID / PRIVY_APP_SECRET)");
    }
    client = new PrivyClient(appId, appSecret);
  }
  return client;
}

/** Returns the Privy user id (did:privy:…) or null when missing/invalid. */
export async function verifyPrivyRequest(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const claims = await getClient().verifyAuthToken(header.slice("Bearer ".length));
    return claims.userId;
  } catch {
    return null;
  }
}
