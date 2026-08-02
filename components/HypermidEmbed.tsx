"use client";

import { useEffect, useId, useRef } from "react";
import type {
  HypermidCheckoutError,
  HypermidCheckoutSuccess,
} from "@hypermid/checkout";

/**
 * Thin React wrapper over @hypermid/checkout's imperative embed.
 *
 * The published package (v0.1.0) is not a React component — it mounts the
 * hosted checkout app (app.hypermid.io) in a sandboxed iframe via
 * HypermidCheckout.init({ containerId, checkoutId, … }). Wallet connect
 * (Reown) lives inside that iframe. The dynamic import keeps all DOM code
 * out of SSR.
 *
 * Post-CR-284 this component is bypassed entirely in favor of the headless
 * EIP-1193 flow — see the handoff note in DepositModal.tsx.
 */
export default function HypermidEmbed({
  checkoutId,
  label,
  onSuccess,
  onError,
  onClose,
}: {
  checkoutId: string;
  label?: string;
  onSuccess?: (payload: HypermidCheckoutSuccess) => void;
  onError?: (payload: HypermidCheckoutError) => void;
  onClose?: () => void;
}) {
  const containerId = `hm-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const callbacks = useRef({ onSuccess, onError, onClose });
  callbacks.current = { onSuccess, onError, onClose };

  useEffect(() => {
    let instance: { destroy(): void } | null = null;
    let cancelled = false;

    void import("@hypermid/checkout").then(({ HypermidCheckout }) => {
      if (cancelled) return;
      instance = HypermidCheckout.init({
        containerId,
        checkoutId,
        theme: "dark",
        label,
        // Match the demo palette (D-18 theming tokens)
        accent: "6d7cff",
        bgPage: "0c1017",
        bgCard: "12161f",
        border: "1d2432",
        textPrimary: "e6e9f2",
        textMuted: "8b93a7",
        borderRadius: "16px",
        width: "100%",
        height: "600px",
        onSuccess: (p) => callbacks.current.onSuccess?.(p),
        onError: (p) => callbacks.current.onError?.(p),
        onClose: () => callbacks.current.onClose?.(),
      });
    });

    return () => {
      cancelled = true;
      instance?.destroy();
    };
    // containerId is stable per mount; remount only when the session changes
  }, [checkoutId, containerId, label]);

  return <div id={containerId} className="w-full" />;
}
