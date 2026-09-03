"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Modal from "./Modal";
import HypermidEmbed from "./HypermidEmbed";
import { addToBalance } from "@/lib/balance";
import { formatUsdc } from "@/lib/formatting";

// Historical CR-284 branch. @hypermid/checkout is deprecated; do not enable
// this path for a new integration. Migrate the demo to @hypermid/sdk first.
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
      // Deliberately inert until this archived demo is migrated to @hypermid/sdk.
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
