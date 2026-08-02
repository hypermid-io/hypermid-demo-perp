"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Modal from "./Modal";
import HypermidEmbed from "./HypermidEmbed";
import { subtractFromBalance } from "@/lib/balance";
import { formatUsdc, isEvmAddress, parseUsdc } from "@/lib/formatting";

const MAX_WITHDRAW_BASE = 2_000_000n; // mirror of the server-side cap

type Phase = "form" | "creating" | "ready" | "success" | "error";

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
  const [phase, setPhase] = useState<Phase>("form");
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
