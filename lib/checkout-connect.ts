/**
 * Standalone parent-side bridge for Hypermid Checkout.
 *
 * This is a self-contained copy of @hypermid/checkout-connect/src/parent.ts
 * that does NOT depend on the offchain-agents monorepo. It exists because
 * npm link / file: dependencies pull the monorepo's React tree and cause
 * hook failures (duplicate React).
 *
 * Source: packages/checkout-connect/src/parent.ts in offchain-agents.
 * NOTE (S20-80): the upstream package is ALSO stale — it still defaults to
 * the legacy API host and calls the non-existent per-id `POST /v1/payments/:id/quote`.
 * The fixes here (server.hypermid.io host, `pay.hypermid.io` origin, the real
 * `GET /v1/payments/quote` contract) should be ported back to it.
 */

import type { Address, TransactionRequest } from "viem";

/**
 * The checkout iframe's origin. Env-driven (default `https://pay.hypermid.io`)
 * so a service rename never again requires a code change here — this is the
 * SECOND such rename (the prior checkout host had a different name). It stays a single, exact
 * origin, NOT a wildcard: the bridge compares `event.origin` against it to
 * reject forged parent↔iframe messages, and loosening it to `*` is how S20-52
 * dropped every message. Env lets the merchant point at their own host without
 * weakening that equality check.
 */
export const IFRAME_ORIGIN =
  process.env.NEXT_PUBLIC_HYPERMID_CHECKOUT_ORIGIN ?? "https://pay.hypermid.io";
export const PROTOCOL_VERSION = 1 as const;

/** Native-asset sentinel the checkout backend expects as `payToken` for a
 *  native (gas-token) source — mirrors `NATIVE_SENTINEL` in apps/checkout. */
const NATIVE_SENTINEL = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// ─── Types (copied from packages/checkout-connect/src/types.ts) ────────────

interface SignRequestMessage {
  type: "hypermid:sign-request";
  version: typeof PROTOCOL_VERSION;
  id: string;
  checkoutId: string;
  intent: "pay" | "approve";
  chainId: number;
  tokenAddress: `0x${string}` | null;
  description: string;
}

type IframeMessage =
  | { type: "hypermid:ready"; version: typeof PROTOCOL_VERSION }
  | SignRequestMessage
  | { type: "hypermid:payment-complete"; version: typeof PROTOCOL_VERSION; checkoutId: string; txHash: string; paidAmount: string }
  | { type: "hypermid:error"; version: typeof PROTOCOL_VERSION; checkoutId: string; reason: string };

type ParentMessage =
  | { type: "hypermid:init"; version: typeof PROTOCOL_VERSION; address: `0x${string}`; chainId: number; origin: string }
  | { type: "hypermid:address-changed"; version: typeof PROTOCOL_VERSION; address: `0x${string}`; chainId: number }
  | { type: "hypermid:disconnected"; version: typeof PROTOCOL_VERSION };

type ParentResponseMessage =
  | { type: "hypermid:sign-result"; version: typeof PROTOCOL_VERSION; id: string; txHash: string }
  | { type: "hypermid:sign-rejected"; version: typeof PROTOCOL_VERSION; id: string; reason: string };

// ─── Trusted contract allowlist (copied from packages/wallet/src/trustedContracts.ts) ──

const LIFI_DIAMOND_MAINNET = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE";
const LIFI_DIAMOND_BASE = "0x4D0A805e70D183c0E805cC5b2dEDb0E05d5E2b82";
const LIFI_DIAMOND_BSC = "0x4D0A805e70D183c0E805cC5b2dEDb0E05d5E2b82";
const LIFI_DIAMOND_POLYGON = "0x4D0A805e70D183c0E805cC5b2dEDb0E05d5E2b82";
const LIFI_DIAMOND_ARBITRUM = "0x4D0A805e70D183c0E805cC5b2dEDb0E05d5E2b82";
const LIFI_DIAMOND_OPTIMISM = "0x4D0A805e70D183c0E805cC5b2dEDb0E05d5E2b82";

const TRUSTED_CONTRACTS = new Set<string>([
  LIFI_DIAMOND_MAINNET.toLowerCase(),
  LIFI_DIAMOND_BASE.toLowerCase(),
  LIFI_DIAMOND_BSC.toLowerCase(),
  LIFI_DIAMOND_POLYGON.toLowerCase(),
  LIFI_DIAMOND_ARBITRUM.toLowerCase(),
  LIFI_DIAMOND_OPTIMISM.toLowerCase(),
]);

function isTrustedLifiDiamond(address: string): boolean {
  return TRUSTED_CONTRACTS.has(address.toLowerCase());
}

function assertContractAllowed(
  address: string | undefined,
  _direction: string,
  allowlist: (addr: string) => boolean,
): void {
  if (!address) {
    throw new Error("Transaction has no destination contract — refusing to sign.");
  }
  if (!allowlist(address)) {
    throw new Error(
      `Destination contract ${address} is not in the trusted allowlist — refusing to sign.`,
    );
  }
}

// ─── ParentBridge ───────────────────────────────────────────────────────────

export interface ParentBridgeOptions {
  iframe: HTMLIFrameElement;
  provider: {
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  };
  address: Address;
  chainId: number;
  onReady?: () => void;
  onPaymentComplete?: (checkoutId: string, txHash: string, paidAmount: string) => void;
  onError?: (checkoutId: string, reason: string) => void;
  apiBase?: string;
}

export interface PublicCheckout {
  id: string;
  recipient: string;
  destChain: number;
  destToken: string;
  status: string;
}

export interface QuoteResponse {
  transactionRequest?: TransactionRequest;
}

export class ParentBridge {
  private listener: ((e: MessageEvent) => void) | null = null;
  private ready = false;

  constructor(private opts: ParentBridgeOptions) {}

  start(): void {
    if (this.listener != null) return;
    if (typeof window === "undefined") return;

    this.listener = (e: MessageEvent) => {
      if (e.origin !== IFRAME_ORIGIN) return;
      if (e.data == null || typeof e.data !== "object") return;
      if (e.data.version !== PROTOCOL_VERSION) return;
      if (typeof e.data.type !== "string" || !e.data.type.startsWith("hypermid:")) return;

      const msg = e.data as IframeMessage;
      if (
        msg.type !== "hypermid:ready" &&
        msg.type !== "hypermid:sign-request" &&
        msg.type !== "hypermid:payment-complete" &&
        msg.type !== "hypermid:error"
      ) {
        return;
      }

      this.handleIframeMessage(msg);
    };

    window.addEventListener("message", this.listener);
  }

  stop(): void {
    if (this.listener == null) return;
    window.removeEventListener("message", this.listener);
    this.listener = null;
  }

  sendInit(): void {
    this.postToIframe({
      type: "hypermid:init",
      version: PROTOCOL_VERSION,
      address: this.opts.address,
      chainId: this.opts.chainId,
      origin: typeof window !== "undefined" ? window.location.origin : "",
    });
  }

  sendAddressChanged(address: Address, chainId: number): void {
    this.postToIframe({
      type: "hypermid:address-changed",
      version: PROTOCOL_VERSION,
      address,
      chainId,
    });
  }

  sendDisconnected(): void {
    this.postToIframe({
      type: "hypermid:disconnected",
      version: PROTOCOL_VERSION,
    });
  }

  private postToIframe(msg: ParentMessage | ParentResponseMessage): void {
    const iframe = this.opts.iframe;
    if (!iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(
        { ...msg, version: PROTOCOL_VERSION },
        IFRAME_ORIGIN,
      );
    } catch {
      /* ignore */
    }
  }

  private async handleIframeMessage(msg: IframeMessage): Promise<void> {
    switch (msg.type) {
      case "hypermid:ready": {
        this.ready = true;
        this.opts.onReady?.();
        this.sendInit();
        break;
      }
      case "hypermid:sign-request": {
        await this.handleSignRequest(msg);
        break;
      }
      case "hypermid:payment-complete": {
        this.opts.onPaymentComplete?.(msg.checkoutId, msg.txHash, msg.paidAmount);
        break;
      }
      case "hypermid:error": {
        this.opts.onError?.(msg.checkoutId, msg.reason);
        break;
      }
    }
  }

  private async handleSignRequest(msg: SignRequestMessage): Promise<void> {
    const apiBase = this.opts.apiBase ?? "https://server.hypermid.io";

    try {
      // 1. Verify the session exists / is payable (recipient is bound server-side).
      const publicRes = await fetch(
        `${apiBase}/v1/payments/${encodeURIComponent(msg.checkoutId)}/public`,
      );
      if (!publicRes.ok) {
        throw new Error(`Failed to fetch checkout session: ${publicRes.status}`);
      }
      void (await publicRes.json());

      // 2. Fetch the executable quote. The real endpoint (post-#266) is a GET
      //    with QUERY params — `GET /v1/payments/quote?checkoutId&payToken&payChain
      //    &fromAddress` — NOT the per-id POST quote this bridge used
      //    to call, which never existed (S20-56). Native sources send the
      //    NATIVE_SENTINEL as `payToken`.
      //
      //    LIMITATION (S20-80): this sign-request protocol carries no amount, so
      //    an OPEN-amount (deposit) session — which needs `destAmount`/`amountIn`
      //    — returns HTTP 400 here; and a SAME-token, SAME-chain payment returns
      //    `transactionRequest: null` (a direct transfer the payer sends without a
      //    router, which this LiFi-Diamond-only bridge can't represent). Both are
      //    surfaced as clear errors rather than a silent wrong call. See the
      //    S20-80 report: the plain embed (widget owns its own wallet) is the
      //    path that actually settles those, and the recommended integration.
      const quoteUrl = new URL(`${apiBase}/v1/payments/quote`);
      quoteUrl.searchParams.set("checkoutId", msg.checkoutId);
      quoteUrl.searchParams.set("payToken", msg.tokenAddress ?? NATIVE_SENTINEL);
      quoteUrl.searchParams.set("payChain", String(msg.chainId));
      quoteUrl.searchParams.set("fromAddress", this.opts.address);

      const quoteRes = await fetch(quoteUrl.toString());
      if (!quoteRes.ok) {
        const body = await quoteRes.text().catch(() => "");
        throw new Error(`Failed to fetch quote: ${quoteRes.status} ${body}`.trim());
      }
      const quote = (await quoteRes.json()) as QuoteResponse;

      if (!quote.transactionRequest) {
        throw new Error(
          "Quote returned no transactionRequest — a same-token same-chain " +
            "payment settles as a direct transfer this bridge does not build. " +
            "Use the standard embed for this pay-token.",
        );
      }

      const tx = quote.transactionRequest;

      assertContractAllowed(tx.to ?? undefined, "inbound", isTrustedLifiDiamond);

      const currentChainHex = (await this.opts.provider.request({
        method: "eth_chainId",
      })) as string;
      const currentChain = parseInt(currentChainHex, 16);
      if (currentChain !== msg.chainId) {
        await this.opts.provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${msg.chainId.toString(16)}` }],
        });
      }

      const txHash = (await this.opts.provider.request({
        method: "eth_sendTransaction",
        params: [tx],
      })) as string;

      this.postToIframe({
        type: "hypermid:sign-result",
        version: PROTOCOL_VERSION,
        id: msg.id,
        txHash,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.postToIframe({
        type: "hypermid:sign-rejected",
        version: PROTOCOL_VERSION,
        id: msg.id,
        reason,
      });
    }
  }

  get isReady(): boolean {
    return this.ready;
  }
}

export function createParentBridge(opts: ParentBridgeOptions): ParentBridge {
  return new ParentBridge(opts);
}
