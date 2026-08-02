"use client";

import { formatUsdc } from "@/lib/formatting";

export default function BalanceCard({
  balance,
  onDeposit,
  onWithdraw,
}: {
  balance: string; // USDC base units
  onDeposit: () => void;
  onWithdraw: () => void;
}) {
  const empty = BigInt(balance || "0") === 0n;

  return (
    <section className="rounded-2xl border border-edge bg-panel p-6">
      <div className="mb-1 font-mono text-[11px] tracking-[0.2em] text-muted">
        BALANCE
      </div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="tnum font-mono text-4xl font-semibold text-white">
          {formatUsdc(balance)}
        </span>
        <span className="font-mono text-sm text-muted">USDC</span>
      </div>
      <div className="mb-6 text-xs text-muted">
        on Base · omnibus custody (demo)
      </div>

      <div className="flex gap-3">
        <button
          onClick={onDeposit}
          className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-dim"
        >
          Deposit
        </button>
        <button
          onClick={onWithdraw}
          disabled={empty}
          className="flex-1 rounded-xl border border-edge px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          Withdraw
        </button>
      </div>

      {empty && (
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Deposit up to $5 to fund your account — pay with any token, settle in
          USDC on Base.
        </p>
      )}
    </section>
  );
}
