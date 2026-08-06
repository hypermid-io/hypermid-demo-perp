"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { HypermidWidget } from "@hypermid/checkout/react";
import { addToBalance } from "@/lib/balance";
import { formatUsdc } from "@/lib/formatting";
import { resolveHypermidSigner, describeSigner } from "@/lib/hypermid-signer";

type Phase = "creating" | "amount" | "widget" | "success" | "error";

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
  const { wallets } = useWallets();
  const smart = useSmartWallets();
  const [phase, setPhase] = useState<Phase>("creating");
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credited, setCredited] = useState("0");
  const [amount, setAmount] = useState("");
  const started = useRef(false);

  // Mint the session up front — the id is what the widget needs.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
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
        setPhase("amount");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create deposit session");
        setPhase("error");
      }
    })();
  }, [getAccessToken]);

  const credit = (paidAmountBase: string) => {
    addToBalance(userId, paidAmountBase);
    setCredited(paidAmountBase);
    onCredited();
    setPhase("success");
  };

  const resolved = checkoutId ? resolveHypermidSigner(smart, wallets) : null;
  const walletInfo = checkoutId ? describeSigner(smart, wallets) : null;

  if (phase === "creating" || phase === "error") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-edge bg-panel p-8 shadow-2xl text-center">
          {phase === "creating" ? (
            <p className="font-mono text-xs tracking-widest text-muted">CREATING SESSION…</p>
          ) : (
            <>
              <p className="text-sm text-down">{error}</p>
              <button
                onClick={onClose}
                className="mt-6 rounded-xl border border-edge px-8 py-2.5 text-sm text-slate-200 transition hover:border-muted"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (phase === "amount") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-edge bg-panel p-6 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-mono text-xs tracking-[0.2em] text-muted">DEPOSIT · USDC ON BASE</h2>
            <button onClick={onClose} aria-label="Close" className="text-muted transition hover:text-white">✕</button>
          </div>

          <label className="mb-2 block text-center font-mono text-[10px] tracking-widest text-muted">
            AMOUNT TO DEPOSIT (USDC)
          </label>
          <input
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            className="tnum w-full rounded-xl border border-edge bg-transparent px-4 py-3 text-center font-mono text-2xl text-white outline-none focus:border-accent"
          />

          {walletInfo ? (
            <p className="mt-3 text-center font-mono text-[10px] text-muted">
              signing with{" "}
              <span className="text-slate-200">
                {walletInfo.kind === "smart" ? "PRIVY SMART WALLET" : "PRIVY EMBEDDED WALLET"}
              </span>
              {walletInfo.gasless && <span className="text-up"> · GAS SPONSORED</span>}
            </p>
          ) : (
            <p className="mt-3 text-center font-mono text-[10px] text-down">no Privy wallet available — log in again</p>
          )}

          <button
            onClick={() => setPhase("widget")}
            disabled={!walletInfo || !amount.trim()}
            className="mt-6 w-full rounded-xl bg-accent px-8 py-3 text-sm font-semibold text-white transition hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
          <p className="mt-3 text-center font-mono text-[10px] text-muted">settles to USDC on Base · max $5</p>
        </div>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-edge bg-panel p-8 shadow-2xl text-center">
          <div className="mb-2 text-3xl text-up">✓</div>
          <p className="tnum font-mono text-lg text-white">+{formatUsdc(credited)} USDC</p>
          <p className="mt-1 text-xs text-muted">credited to your balance</p>
          <button
            onClick={onClose}
            className="mt-6 rounded-xl bg-accent px-8 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-dim"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // phase === "widget"
  if (!resolved || !checkoutId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-edge bg-panel p-8 shadow-2xl text-center">
          <p className="font-mono text-xs text-down">No Privy wallet available — log in again</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-edge shadow-2xl">
        <HypermidWidget
          sessionId={checkoutId}
          signer={resolved.signer}
          amount={amount.trim()}
          theme="dark"
          onSuccess={({ paidAmount }) => {
            credit(paidAmount ?? "0");
          }}
          onError={({ reason }) => {
            setError(reason ?? "Deposit failed");
            setPhase("error");
          }}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
