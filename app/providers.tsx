"use client";

import { PrivyProvider } from "@privy-io/react-auth";

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
      {children}
    </PrivyProvider>
  );
}
