/**
 * Standalone parent-side bridge for Hypermid Checkout.
 *
 * This is a self-contained copy of @hypermid/checkout-connect/src/parent.ts
 * that does NOT depend on the offchain-agents monorepo. It exists because
 * npm link / file: dependencies pull the monorepo's React tree and cause
 * hook failures (duplicate React).
 *
 * Source: packages/checkout-connect/src/parent.ts in offchain-agents
 * Keep in sync with any security-critical changes there.
 */

import type { Address, TransactionRequest } from "viem";

export const IFRAME_ORIGIN = "https://checkout.hypermid.io" as const;
export const PROTOCOL_VERSION = 1 as const;

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

// ─── Trusted contract allowlist (copied verbatim from packages/wallet/src/trustedContracts.ts)
// DO NOT EDIT BY HAND — update from source only.

const LIFI_DIAMONDS = new Set<string>([
  "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE".toLowerCase(), // Eth/OP/Polygon/Arb/Base
  "0x864b314D4C5a0399368609581d3E8933a63b9232".toLowerCase(), // Unichain
]);

function isTrustedLifiDiamond(address: string | undefined): boolean {
  if (!address) return false;
  return LIFI_DIAMONDS.has(address.toLowerCase());
}

class ContractNotAllowedError extends Error {
  constructor(to: string, kind: "inbound" | "outbound") {
    super(
      `Refusing to sign a transaction to an unknown contract (${to}). ` +
        (kind === "outbound"
          ? "Expected the Hypermid OutboundSender or USDCh contract on PulseChain."
          : "Expected LiFi Diamond or a Hypermid Sender contract.") +
        " This is a safety check.",
    );
    this.name = "ContractNotAllowedError";
  }
}

function assertContractAllowed(
  to: string | undefined,
  kind: "inbound" | "outbound",
  isTrusted: (addr: string | undefined) => boolean = isTrustedLifiDiamond,
): void {
  if (!isTrusted(to)) throw new ContractNotAllowedError(to ?? "<undefined>", kind);
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
    const apiBase = this.opts.apiBase ?? "https://api.hypermid.io";

    try {
      const publicRes = await fetch(
        `${apiBase}/v1/checkout/${encodeURIComponent(msg.checkoutId)}/public`,
      );
      if (!publicRes.ok) {
        throw new Error(`Failed to fetch checkout session: ${publicRes.status}`);
      }
      void (await publicRes.json());

      const quoteRes = await fetch(
        `${apiBase}/v1/checkout/${encodeURIComponent(msg.checkoutId)}/quote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromAddress: this.opts.address,
            chainId: msg.chainId,
            tokenAddress: msg.tokenAddress,
          }),
        },
      );
      if (!quoteRes.ok) {
        throw new Error(`Failed to fetch quote: ${quoteRes.status}`);
      }
      const quote = (await quoteRes.json()) as QuoteResponse;

      if (!quote.transactionRequest) {
        throw new Error("Quote returned no transaction request.");
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
