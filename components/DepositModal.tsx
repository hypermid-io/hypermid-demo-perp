"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Modal from "./Modal";
import HypermidEmbed from "./HypermidEmbed";
import { addToBalance } from "@/lib/balance";
import { formatUsdc } from "@/lib/formatting";

// ─── CR-284 M4 HANDOFF ───────────────────────────────────────────────────────
// Today the deposit runs inside the hosted Hypermid iframe; wallet connect
// (Reown) lives inside the frame and any external wallet can pay.
//
// CR-284 M1 publishes `@hypermid/checkout/headless` (the module already exists
// as src/headless.ts in hypermid-checkout-widget: it drives quote → approve →
// sign → settle against ANY EIP-1193 provider and boots no wallet stack).
// The M4 acceptance test for embedded-wallet UX is then:
//
//   1. npm i @hypermid/checkout@latest        // headless subpath published
//   2. flip HEADLESS_ENABLED to true
//   3. wire the headless branch below (marked TODO CR-284)
//
// The deposit then signs with the user's Privy embedded wallet via
// wallet.getEthereumProvider() — no iframe, no Reown. No other file changes.
const HEADLESS_ENABLED = false;

type Phase = "creating" | "ready" | "success" | "error";

export default function DepositModal({
  userId,
  onCredited,
  onClose,
}: {
  userId: string;
  onCredited: () => void;
  onClose: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const [phase, setPhase] = useState<Phase>("creating");
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credited, setCredited] = useState("0");
  const started = useRef(false); // guard against StrictMode double-effect

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (HEADLESS_ENABLED) {
      // TODO CR-284 M4: replace the iframe flow with the headless EIP-1193 flow.
      //
      //   const provider = await embeddedWallet.getEthereumProvider(); // EIP-1193
      //   const { HypermidCheckout } = await import("@hypermid/checkout/headless");
      //   const result = await HypermidCheckout.pay({
      //     checkoutId,                       // still created via /api/create-deposit
      //     provider,
      //     onStatus: (s) => { /* drive a spinner: connecting→quoting→approving→signing→confirming→settling */ },
      //   });
      //   if (result.status === "completed") credit(result.paidAmount ?? "0");
      //   else setError(result.reason ?? "Payment failed"), setPhase("error");
      //
      // `embeddedWallet` comes from useWallets() in the dashboard — pass it in
      // as a prop when enabling this branch.
      return;
    }

    // ── Iframe flow (pre-CR-284) ──
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/create-deposit", {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => null)) as {
          checkoutId?: string;
          error?: string;
        } | null;
        if (!res.ok || !json?.checkoutId) {
          throw new Error(json?.error ?? "Failed to create deposit session");
        }
        setCheckoutId(json.checkoutId);
        setPhase("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create deposit session");
        setPhase("error");
      }
    })();
  }, [getAccessToken]);

  const credit = (paidAmountBase: string) => {
    // paidAmount is the backend on-chain-VERIFIED delivered amount (base units).
    addToBalance(userId, paidAmountBase);
    setCredited(paidAmountBase);
    onCredited();
    setPhase("success");
  };

  return (
    <Modal title="DEPOSIT · USDC ON BASE" onClose={onClose}>
      {phase === "creating" && (
        <p className="py-16 text-center font-mono text-xs tracking-widest text-muted">
          CREATING SESSION…
        </p>
      )}

      {phase === "ready" && checkoutId && (
        <>
          <HypermidEmbed
            checkoutId={checkoutId}
            label="Deposit"
            onSuccess={(p) => credit(p.paidAmount ?? "0")}
            onError={(p) => {
              setError(p.reason ?? "Deposit failed");
              setPhase("error");
            }}
            onClose={onClose}
          />
          <p className="mt-3 text-center font-mono text-[10px] text-muted">
            pay with any token · settles to USDC on Base · max $5
          </p>
        </>
      )}

      {phase === "success" && (
        <div className="py-10 text-center">
          <div className="mb-2 text-3xl text-up">✓</div>
          <p className="tnum font-mono text-lg text-white">
            +{formatUsdc(credited)} USDC
          </p>
          <p className="mt-1 text-xs text-muted">credited to your balance</p>
          <button
            onClick={onClose}
            className="mt-6 rounded-xl bg-accent px-8 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-dim"
          >
            Done
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="py-10 text-center">
          <p className="text-sm text-down">{error}</p>
          <button
            onClick={onClose}
            className="mt-6 rounded-xl border border-edge px-8 py-2.5 text-sm text-slate-200 transition hover:border-muted"
          >
            Close
          </button>
        </div>
      )}
    </Modal>
  );
}
