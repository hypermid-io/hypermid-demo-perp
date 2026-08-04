"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";

/**
 * loginMethods includes "wallet" as the external-wallet fallback tab
 * (pre-CR-284 users without an email login) — Privy renders it natively,
 * no Reown needed in THIS app. Reown already lives inside the Hypermid
 * checkout iframe, where it handles payment signing.
 *
 * embeddedWallets.ethereum.createOnLogin provisions the EVM embedded wallet
 * that becomes the deposit signer post-CR-284 (see DepositModal handoff note).
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // Build-time / misconfiguration path: without an app id the PrivyProvider
  // throws during prerender (it validates the id at mount). Render children
  // bare — pages that call Privy hooks will fail loudly at runtime, which is
  // the right signal for a missing required env var.
  if (!appId) {
    if (typeof window !== "undefined") {
      console.error("NEXT_PUBLIC_PRIVY_APP_ID is not set — auth is disabled");
    }
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "wallet"],
        appearance: { theme: "dark", accentColor: "#6d7cff" },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      {/*
        CR-284 M4 — Smart Wallets (ERC-4337). Mounting this provider is what
        makes `useSmartWallets().client` available; the signer factory
        (lib/hypermid-signer.ts) prefers it over the embedded EOA so gas is
        sponsored by the paymaster and the user pays NOTHING.

        ⚠️ Requires Smart Wallets ENABLED + a FUNDED PAYMASTER in the Privy
        dashboard. Without that, `client` stays undefined and the app degrades
        cleanly to the embedded EOA (user pays their own gas) — which is why
        this is safe to mount before the dashboard work is done.
      */}
      <SmartWalletsProvider>{children}</SmartWalletsProvider>
    </PrivyProvider>
  );
}
