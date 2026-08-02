"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import BalanceCard from "@/components/BalanceCard";
import FakePositions from "@/components/FakePositions";
import DepositModal from "@/components/DepositModal";
import WithdrawModal from "@/components/WithdrawModal";
import { clearBalance, getBalance } from "@/lib/balance";
import { truncateAddress } from "@/lib/formatting";

type ModalKind = "none" | "deposit" | "withdraw";

export default function Dashboard() {
  const router = useRouter();
  const { ready, authenticated, user, logout } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0]; // Privy embedded EVM wallet

  const userId = user?.id ?? null;
  const [balance, setBalance] = useState("0");
  const [modal, setModal] = useState<ModalKind>("none");

  useEffect(() => {
    if (ready && !authenticated) router.replace("/");
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (userId) setBalance(getBalance(userId));
  }, [userId]);

  const refreshBalance = useCallback(() => {
    if (userId) setBalance(getBalance(userId));
  }, [userId]);

  const handleSignOut = useCallback(async () => {
    if (userId) clearBalance(userId); // MVP: local balance dies with the session
    await logout();
    router.replace("/");
  }, [logout, router, userId]);

  if (!ready || !authenticated || !userId) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="font-mono text-xs tracking-widest text-muted">LOADING…</div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-6">
      <header className="mb-8 flex items-center justify-between border-b border-edge pb-4">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-tight text-white">
            Demo Perp
          </span>
          <span className="rounded-full border border-edge bg-panel px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-accent">
            BASE
          </span>
        </div>
        <div className="flex items-center gap-3">
          {wallet && (
            <span className="rounded-full border border-edge bg-panel px-3 py-1 font-mono text-xs text-muted">
              {truncateAddress(wallet.address)}
            </span>
          )}
          <button
            onClick={handleSignOut}
            className="rounded-lg border border-edge px-3 py-1.5 text-xs text-muted transition hover:border-muted hover:text-white"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <BalanceCard
          balance={balance}
          onDeposit={() => setModal("deposit")}
          onWithdraw={() => setModal("withdraw")}
        />
        <FakePositions />
      </div>

      {modal === "deposit" && (
        <DepositModal
          userId={userId}
          onCredited={refreshBalance}
          onClose={() => setModal("none")}
        />
      )}
      {modal === "withdraw" && (
        <WithdrawModal
          userId={userId}
          balance={balance}
          onDebited={refreshBalance}
          onClose={() => setModal("none")}
        />
      )}
    </main>
  );
}
