"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import Modal from "./Modal";
import HypermidEmbed from "./HypermidEmbed";
import { subtractFromBalance } from "@/lib/balance";
import { formatUsdc, isEvmAddress, parseUsdc } from "@/lib/formatting";
import { resolveHypermidSigner, type ResolvedSigner } from "@/lib/hypermid-signer";

const MAX_WITHDRAW_BASE = 2_000_000n; // mirror of the server-side cap

// ─── CR-284 M4 ───────────────────────────────────────────────────────────────
// Headless withdrawal: the fund owner signs from their own Privy wallet.
//
// This is a FIXED-SIZING session — `/v1/withdrawal` is created WITH `amount`,
// so dest_amount is a real value and `pay()` must NOT receive an `amount`.
// (Deposit is the mirror image: open sizing, amount required.) The SDK rejects
// either mismatch rather than silently ignoring the input.
//
// The destination is partner-supplied and NOT allowlisted server-side, which is
// exactly why the SDK's pre-send drift guard matters here: it re-reads /public
// immediately before signing and aborts if `recipient` moved.
const HEADLESS_ENABLED = true;

type Phase = "form" | "creating" | "paying" | "ready" | "success" | "error";

export default function WithdrawModal({
  userId,
  balance,
  onDebited,
  onClose,
}: {
  userId: string;
  balance: string; // USDC base units
  onDebited: () => void;
  onClose: () => void;
}) {
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const smart = useSmartWallets();
  const [phase, setPhase] = useState<Phase>("form");
  const [status, setStatus] = useState<string>("");
  const [resolved, setResolved] = useState<ResolvedSigner | null>(null);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountBase = parseUsdc(amount);
  const formError = !isEvmAddress(destination)
    ? "Enter a valid destination address (0x…)"
    : amountBase === null
      ? "Enter a valid amount"
      : BigInt(amountBase) <= 0n
        ? "Amount must be greater than zero"
        : BigInt(amountBase) > MAX_WITHDRAW_BASE
          ? "Demo cap is 2 USDC per withdrawal"
          : BigInt(amountBase) > BigInt(balance || "0")
            ? "Amount exceeds your balance"
            : null;

  const setMax = () => {
    const cap =
      BigInt(balance || "0") < MAX_WITHDRAW_BASE
        ? BigInt(balance || "0")
        : MAX_WITHDRAW_BASE;
    setAmount(formatUsdc(cap.toString(), 6));
  };

  const submit = async () => {
    if (formError || amountBase === null) return;
    setPhase("creating");
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/create-withdrawal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ destination: destination.trim(), amount }),
      });
      const json = (await res.json().catch(() => null)) as {
        checkoutId?: string;
        error?: string;
      } | null;
      if (!res.ok || !json?.checkoutId) {
        throw new Error(json?.error ?? "Failed to create withdrawal session");
      }
      setCheckoutId(json.checkoutId);
      if (HEADLESS_ENABLED) {
        void payHeadless(json.checkoutId);
        return;
      }
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create withdrawal session");
      setPhase("error");
    }
  };

  const complete = () => {
    // The widget settled on-chain; decrement the local demo balance by the
    // requested amount. (Phase 2: server-side ledger via withdrawal.completed.)
    subtractFromBalance(userId, amountBase!);
    onDebited();
    setPhase("success");
  };

  // CR-284 M4 — sign the withdrawal from the user's own Privy wallet.
  // NOTE: no `amount` is passed. The session is FIXED-sized (created with
  // `amount` server-side), and the SDK rejects a client-supplied amount on a
  // fixed session rather than ignoring it.
  async function payHeadless(id: string) {
    const r = resolveHypermidSigner(smart, wallets);
    if (!r) {
      setError("No Privy wallet available — log in again.");
      setPhase("error");
      return;
    }
    setResolved(r);
    setPhase("paying");
    try {
      const { HypermidCheckout } = await import("@hypermid/checkout/headless");
      const result = await HypermidCheckout.pay({
        checkoutId: id,
        provider: r.signer,
        onStatus: (s) => setStatus(s),
      });
      if (result.status === "completed") {
        complete();
      } else {
        setError(result.reason ?? "Withdrawal failed");
        setPhase("error");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdrawal failed");
      setPhase("error");
    }
  }

  return (
    <Modal title="WITHDRAW · USDC ON BASE" onClose={onClose}>
      {phase === "form" && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block font-mono text-[10px] tracking-wider text-muted">
              WHERE TO SEND?
            </label>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
              className="w-full rounded-xl border border-edge bg-raised px-3.5 py-2.5 font-mono text-sm text-white outline-none placeholder:text-muted/50 focus:border-accent"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="font-mono text-[10px] tracking-wider text-muted">
                AMOUNT (USDC)
              </label>
              <button
                onClick={setMax}
                className="font-mono text-[10px] tracking-wider text-accent hover:text-white"
              >
                MAX
              </button>
            </div>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="tnum w-full rounded-xl border border-edge bg-raised px-3.5 py-2.5 font-mono text-sm text-white outline-none placeholder:text-muted/50 focus:border-accent"
            />
            <p className="mt-1.5 font-mono text-[10px] text-muted">
              available {formatUsdc(balance)} USDC · demo cap 2 USDC
            </p>
          </div>
          <button
            onClick={submit}
            disabled={!!formError}
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      )}

      {phase === "creating" && (
        <p className="py-16 text-center font-mono text-xs tracking-widest text-muted">
          CREATING SESSION…
        </p>
      )}

      {phase === "paying" && (
        <div className="py-16 text-center">
          <p className="font-mono text-xs tracking-widest text-muted">
            {status ? status.toUpperCase() + "\u2026" : "SENDING\u2026"}
          </p>
          {resolved && (
            <p className="mt-2 font-mono text-[10px] text-muted">
              {resolved.kind === "smart" ? "PRIVY SMART WALLET" : "PRIVY EMBEDDED WALLET"}
              {resolved.gasless && <span className="text-up"> \u00b7 GAS SPONSORED</span>}
            </p>
          )}
        </div>
      )}

      {phase === "ready" && checkoutId && (
        <>
          <HypermidEmbed
            checkoutId={checkoutId}
            label="Withdraw"
            onSuccess={complete}
            onError={(p) => {
              setError(p.reason ?? "Withdrawal failed");
              setPhase("error");
            }}
            onClose={onClose}
          />
          <p className="mt-3 text-center font-mono text-[10px] text-muted">
            your connected wallet funds the withdrawal · {amount} USDC →{" "}
            {destination.slice(0, 6)}…{destination.slice(-4)}
          </p>
        </>
      )}

      {phase === "success" && (
        <div className="py-10 text-center">
          <div className="mb-2 text-3xl text-up">✓</div>
          <p className="tnum font-mono text-lg text-white">
            −{formatUsdc(amountBase ?? "0")} USDC
          </p>
          <p className="mt-1 text-xs text-muted">
            sent to {destination.slice(0, 6)}…{destination.slice(-4)}
          </p>
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
            onClick={() => setPhase("form")}
            className="mt-6 rounded-xl border border-edge px-8 py-2.5 text-sm text-slate-200 transition hover:border-muted"
          >
            Back
          </button>
        </div>
      )}
    </Modal>
  );
}
