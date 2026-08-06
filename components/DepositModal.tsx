"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import Modal from "./Modal";
import HypermidEmbed from "./HypermidEmbed";
import { addToBalance } from "@/lib/balance";
import { formatUsdc } from "@/lib/formatting";
import { resolveHypermidSigner, describeSigner } from "@/lib/hypermid-signer";

// ─── CR-284 M4 ───────────────────────────────────────────────────────────────
// Headless deposit: signs with the user's Privy wallet directly — no iframe, no
// Reown. Prefers the sponsored SMART WALLET (user pays no gas) and falls back
// to the embedded EOA.
//
// This is an OPEN-SIZING session (`/v1/deposit` is created without `amount`, so
// dest_amount is the "0" sentinel), which is why the amount is collected HERE
// and passed to `pay({ amount })`. The SDK rejects a fixed session that
// supplies `amount` and an open one that omits it, mirroring the backend — so
// getting the pairing wrong fails loudly rather than silently mis-sizing.
//
// Set to false to fall back to the pre-CR-284 hosted iframe (kept working).
const HEADLESS_ENABLED = true;

type Phase = "creating" | "amount" | "paying" | "ready" | "success" | "error";

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
  const [status, setStatus] = useState<string>("");
  const started = useRef(false); // guard against StrictMode double-effect

  // Mint the session up front in BOTH modes — the id is what the SDK needs.
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
        setPhase(HEADLESS_ENABLED ? "amount" : "ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create deposit session");
        setPhase("error");
      }
    })();
  }, [getAccessToken]);

  // Which Privy wallet backs the signer — PRIMITIVES ONLY, derived during
  // render. Deliberately NOT state-via-effect: `smart` and `wallets` are new
  // references every render and `resolveHypermidSigner` returns a fresh object,
  // so `useEffect(... , [smart, wallets]) -> setState` loops forever
  // ("Maximum update depth exceeded"). Strings/booleans compare by value, so
  // there is nothing to loop on. The signer itself is built at CLICK time in
  // `payHeadless` — also strictly more correct, since a signer captured during
  // render can close over a Privy client that has since been replaced.
  const walletInfo = HEADLESS_ENABLED ? describeSigner(smart, wallets) : null;

  const credit = (paidAmountBase: string) => {
    // paidAmount is the backend on-chain-VERIFIED delivered amount (base units).
    addToBalance(userId, paidAmountBase);
    setCredited(paidAmountBase);
    onCredited();
    setPhase("success");
  };

  async function payHeadless() {
    if (!checkoutId) return;
    // Resolve at CLICK time — never from render-time state.
    const resolved = resolveHypermidSigner(smart, wallets);
    if (!resolved) {
      setError("No Privy wallet available — log in again.");
      setPhase("error");
      return;
    }
    setPhase("paying");
    setError(null);
    try {
      const { HypermidCheckout } = await import("@hypermid/checkout/headless");
      const result = await HypermidCheckout.pay({
        checkoutId,
        provider: resolved.signer,
        // OPEN sizing → the payer's target is REQUIRED.
        amount: amount.trim(),
        onStatus: (s) => setStatus(s),
      });
      if (result.status === "completed") {
        // `paidAmount` is null on the EVM rail (/public gates it to the near
        // rail), so credit what the backend verified when present and fall back
        // to the requested amount otherwise.
        credit(result.paidAmount ?? "0");
      } else {
        setError(result.reason ?? "Deposit failed");
        setPhase("error");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deposit failed");
      setPhase("error");
    }
  }

  return (
    <Modal title="DEPOSIT · USDC ON BASE" onClose={onClose}>
      {phase === "creating" && (
        <p className="py-16 text-center font-mono text-xs tracking-widest text-muted">
          CREATING SESSION…
        </p>
      )}

      {/* ── CR-284 M4 headless: amount entry, then sign with the Privy wallet ── */}
      {phase === "amount" && (
        <div className="py-6">
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
            <p className="mt-3 text-center font-mono text-[10px] text-down">
              no Privy wallet available — log in again
            </p>
          )}

          <button
            onClick={payHeadless}
            disabled={!walletInfo || !amount.trim()}
            className="mt-6 w-full rounded-xl bg-accent px-8 py-3 text-sm font-semibold text-white transition hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-40"
          >
            Deposit
          </button>
          <p className="mt-3 text-center font-mono text-[10px] text-muted">
            settles to USDC on Base · max $5
          </p>
        </div>
      )}

      {phase === "paying" && (
        <div className="py-16 text-center">
          <p className="font-mono text-xs tracking-widest text-muted">
            {status ? status.toUpperCase() + "…" : "PAYING…"}
          </p>
          {walletInfo?.gasless && (
            <p className="mt-2 font-mono text-[10px] text-up">GAS SPONSORED — YOU PAY NOTHING</p>
          )}
        </div>
      )}

      {/* ── Pre-CR-284 hosted iframe (HEADLESS_ENABLED=false) ── */}
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
          <p className="tnum font-mono text-lg text-white">+{formatUsdc(credited)} USDC</p>
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
