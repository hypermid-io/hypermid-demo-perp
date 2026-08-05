# Demo Perp — Hypermid Deposit + Withdrawal reference integration

A small, deployable demo perp platform integrating **Hypermid deposits and
withdrawals end-to-end**. Three purposes:

1. **End-to-end integration test bed** — the full merchant → widget → user flow.
2. **CR-284 M4 live-test target** — flip one flag to move deposits from the
   hosted iframe to the user's Privy embedded wallet (see
   [CR-284 handoff](#cr-284-m4-handoff)).
3. **Partner reference implementation** — fork it and adapt.

Demo bounds: **$5 max deposit / $2 max withdraw**, USDC on Base, production
`api.hypermid.io`. Positions are simulated; there is no real trading.

## Quickstart

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

| Env var | Where used | Notes |
| --- | --- | --- |
| `HYPERMID_SK` | server only (`/api/create-*`) | `sk_live_…`. **Never** `NEXT_PUBLIC_`. |
| `PRIVY_APP_SECRET` | server only (`/api/create-*`) | Verifies user JWTs before touching `HYPERMID_SK`. |
| `NEXT_PUBLIC_PRIVY_APP_ID` | client + server | From the Privy dashboard. |
| `NEXT_PUBLIC_HYPERMID_API_URL` | server | Defaults to `https://api.hypermid.io`. |
| `MIDDLEWARE_PASSWORD` | edge middleware | Site-wide basic auth (any username). Set in prod. |
| `HYPERMID_WEBHOOK_SECRET` | server (`/api/webhook`) | Phase 2. Unset → route returns 503. |

## How it works

```
Browser                                Your server                     Hypermid
───────                                ──────────                     ────────
Privy login (email / external wallet)
  → embedded EVM wallet provisioned
Deposit click
  ── Bearer <privy JWT> ──────────────▶ /api/create-deposit
                                        verifies JWT (PRIVY_APP_SECRET)
                                        ── Bearer sk_live ───────────▶ POST /v1/deposit
                                          { recipient: TREASURY,        (recipient must be on the
                                            maxAmount: 5_000_000 }       partner payout allowlist)
                                        ◀──────────── { id: "co_…" } ──
  ◀────────────── { checkoutId } ──────
<HypermidEmbed checkoutId>              (iframe: app.hypermid.io — wallet
  user pays with any token               connect + signing happen inside)
  ◀── onSuccess({ paidAmount }) ──      backend on-chain-VERIFIED
localStorage balance += paidAmount
```

Withdrawal mirrors it: a small form (destination + amount) →
`/api/create-withdrawal` → `POST /v1/withdrawal` → same embed. The withdrawal
destination is **not** allowlisted on Hypermid's side (by design, CR-283 B):
the signing wallet's preview is the authorization gate, and **the signing
wallet funds the withdrawal** — in this demo that's the user's own connected
wallet, and the local demo balance is decremented when `onSuccess` fires.

### Omnibus custody is the real pattern

All deposits settle to one allowlisted treasury address; per-user attribution
rides in `orderId` / `metadata`. This is not a demo shortcut — it's how
Coinbase, Binance, and Hyperliquid custody user funds. The platform owes each
user a balance (tracked in `localStorage` for the MVP, a real ledger in
phase 2); the chain holds the omnibus total.

## Security model

- `HYPERMID_SK` exists only in server-side API routes. Verify the deployed
  bundle: `curl -s https://<deploy>/_next/static/chunks/… | grep sk_live` → empty.
- `/api/create-*` requires a valid **Privy user JWT**, verified server-side.
  Basic auth protects the pages; the API routes carry their own auth.
- Caps (`5_000_000` / `2_000_000` base units) are enforced **server-side** in
  `lib/hypermid.ts` — the client cap is cosmetic.
- `/api/webhook` verifies the Stripe-style `X-Hypermid-Signature: t=…,v1=…`
  HMAC with a 5-minute replay window, and returns 503 until a secret is set.

## CR-284 M4 handoff

`@hypermid/checkout@0.1.0` is iframe-only — there is no `signer` prop. The
signer-injection surface is the **headless module** (already written as
`src/headless.ts` in `hypermid-checkout-widget`, unpublished): it drives
quote → approve → sign → settle against **any EIP-1193 provider** and boots no
wallet stack.

M1: publish `@hypermid/checkout/headless`. M4 acceptance test:

1. `npm i @hypermid/checkout@latest`
2. `components/DepositModal.tsx` → set `HEADLESS_ENABLED = true`
3. Wire the marked branch: `provider = await embeddedWallet.getEthereumProvider()`,
   `HypermidCheckout.pay({ checkoutId, provider })`

Deposits then sign with the user's Privy embedded wallet — no iframe, no
Reown. No other file changes.

**Chain declaration is required.** Privy's embedded wallet defaults to Ethereum
(1) unless `defaultChain` and `supportedChains` are declared in `PrivyProvider`
config. If the wallet is on chain 1 and the session expects Base (8453), the
signer's `ensureChain` guard aborts with "did not switch to chain 8453". Set
both fields to the chain your deposits/withdrawals settle on:

```tsx
<PrivyProvider config={{ defaultChain: base, supportedChains: [base] }}>
```

## Phase 2 (not in this build)

- Webhook-driven ledger (Supabase): `deposit.completed` / `withdrawal.completed`
  → balance source of truth. `/api/webhook` already verifies signatures; the
  TODO in that route marks the ledger write. For `withdrawal.completed`,
  **verify `destinationWallet` against your own dispatch record** — the
  destination is not allowlisted on Hypermid's side.
- Session-keyed balance instead of localStorage.

## Deploy

Vercel, auto-deploy from `main`. Set the env vars above in the project
settings, keep `MIDDLEWARE_PASSWORD` on during the pilot, and point
`demo-perp.hypermid.io` at the deployment via the existing Cloudflare setup.
