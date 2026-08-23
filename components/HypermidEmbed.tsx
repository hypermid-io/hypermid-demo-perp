"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createParentBridge, type ParentBridge } from "@/lib/checkout-connect";

/**
 * Hypermid Checkout embed with S20-41 bridge support.
 *
 * When the user has a Privy wallet connected, this component mounts the
 * checkout iframe with ?bridge=1 and creates a ParentBridge that routes
 * EVM signatures through the merchant's page — no second connect step.
 *
 * Falls back to the standard iframe embed (no bridge) when:
 * - No wallet is connected
 * - The wallet has no EIP-1193 provider
 * - The bridge fails to initialize
 *
 * Message logging: every postMessage in both directions is logged to
 * console with correlation ids for debugging.
 */

// The payments checkout host (renamed; the old host name is retired). Env-driven so
// a rename never needs a code change; defaults to the live host.
const CHECKOUT_ORIGIN =
  process.env.NEXT_PUBLIC_HYPERMID_CHECKOUT_ORIGIN ?? "https://pay.hypermid.io";
const PROTOCOL_VERSION = 1;

interface HypermidEmbedProps {
  checkoutId: string;
  label?: string;
  onSuccess?: (payload: { paidAmount?: string; txHash?: string }) => void;
  onError?: (payload: { reason?: string }) => void;
  onClose?: () => void;
}

export default function HypermidEmbed({
  checkoutId,
  label,
  onSuccess,
  onError,
  onClose,
}: HypermidEmbedProps) {
  const containerId = `hm-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const callbacks = useRef({ onSuccess, onError, onClose });
  callbacks.current = { onSuccess, onError, onClose };

  const { wallets } = useWallets();
  const wallet = wallets[0];
  const [bridgeState, setBridgeState] = useState<"idle" | "ready" | "error">("idle");
  const bridgeRef = useRef<ParentBridge | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initBridge() {
      if (!wallet) {
        console.log("[bridge] No wallet connected — using standard iframe");
        return;
      }

      try {
        const provider = await wallet.getEthereumProvider();
        if (!provider) {
          console.log("[bridge] Wallet has no Ethereum provider");
          return;
        }

        const iframe = iframeRef.current;
        if (!iframe) return;

        console.log("[bridge] Creating ParentBridge with address:", wallet.address);

        const bridge = createParentBridge({
          iframe,
          provider,
          address: wallet.address as `0x${string}`,
          chainId: typeof wallet.chainId === "string" ? parseInt(wallet.chainId, 10) : (wallet.chainId ?? 8453),
          onReady: () => {
            console.log("[bridge] ParentBridge ready — iframe received init");
            setBridgeState("ready");
          },
          onPaymentComplete: (checkoutId, txHash, paidAmount) => {
            console.log("[bridge] Payment complete:", { checkoutId, txHash, paidAmount });
            callbacks.current.onSuccess?.({ paidAmount, txHash });
          },
          onError: (checkoutId, reason) => {
            console.error("[bridge] Iframe error:", { checkoutId, reason });
            callbacks.current.onError?.({ reason });
          },
        });

        bridge.start();
        bridgeRef.current = bridge;

        // Note: postMessage logging is handled by the ParentBridge class
        // which logs all messages via its internal postToIframe method.

        if (cancelled) {
          bridge.stop();
          return;
        }
      } catch (err) {
        console.error("[bridge] Failed to initialize:", err);
        setBridgeState("error");
      }
    }

    initBridge();

    return () => {
      cancelled = true;
      bridgeRef.current?.stop();
      bridgeRef.current = null;
    };
  }, [wallet, checkoutId]);

  // Build the iframe URL with bridge flag and theming
  const iframeUrl = (() => {
    const params = new URLSearchParams();
    params.set("checkoutId", checkoutId);
    params.set("bridge", "1");
    if (label) params.set("label", label);
    params.set("theme", "dark");
    params.set("accent", "6d7cff");
    params.set("bgPage", "0c1017");
    params.set("bgCard", "12161f");
    params.set("border", "1d2432");
    params.set("textPrimary", "e6e9f2");
    params.set("textMuted", "8b93a7");
    // NOTE: the checkout widget has no `borderRadius` theme param (only
    // theme/accent/bgPage/bgCard/border/textPrimary/textMuted/font) — it was
    // silently ignored, so it's dropped rather than demonstrated to merchants.
    return `${CHECKOUT_ORIGIN}/checkout?${params.toString()}`;
  })();

  return (
    <div id={containerId} className="w-full">
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        title="Hypermid Checkout"
        className="w-full"
        style={{ height: "600px", border: "none", borderRadius: "16px" }}
        allow="clipboard-write; payment; web-share"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
      />
      {bridgeState === "ready" && (
        <p className="mt-2 text-center font-mono text-[10px] text-accent">
          Bridge active — using connected wallet
        </p>
      )}
      {bridgeState === "error" && (
        <p className="mt-2 text-center font-mono text-[10px] text-down">
          Bridge failed — fallback to standard connect
        </p>
      )}
    </div>
  );
}
