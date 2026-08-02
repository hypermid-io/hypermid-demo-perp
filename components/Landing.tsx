"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

export default function Landing() {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();

  useEffect(() => {
    if (ready && authenticated) router.replace("/dashboard");
  }, [ready, authenticated, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-2 font-mono text-xs tracking-[0.3em] text-accent">
          HYPERMID REFERENCE INTEGRATION
        </div>
        <h1 className="mb-3 text-5xl font-semibold tracking-tight text-white">
          Demo Perp
        </h1>
        <p className="mb-10 text-sm leading-relaxed text-muted">
          Perpetuals on Base. Deposits and withdrawals powered by{" "}
          <span className="text-slate-300">Hypermid</span> — pay with any token,
          settle in USDC.
        </p>

        <button
          onClick={() => login()}
          disabled={!ready}
          className="w-full rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-accent-dim disabled:opacity-50"
        >
          {ready ? "Sign in to trade" : "Loading…"}
        </button>

        <p className="mt-8 font-mono text-[11px] leading-relaxed text-muted">
          Demo environment — not a real trading venue.
          <br />
          $5 max deposit · $2 max withdraw · USDC on Base
        </p>
      </div>
    </main>
  );
}
