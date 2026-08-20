"use client";

import { useEffect, useRef, useState } from "react";
import { createParentBridge, type ParentBridge } from "@/lib/checkout-connect";

const MOCK_ADDRESS = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb";
const MOCK_CHAIN_ID = 8453;
const CHECKOUT_ORIGIN = "https://checkout.hypermid.io";

const mockProvider = {
  async request({ method, params }: { method: string; params?: unknown[] }) {
    console.log("[provider]", method, params);
    switch (method) {
      case "eth_chainId":
        return "0x" + MOCK_CHAIN_ID.toString(16);
      case "eth_sendTransaction":
        await new Promise((r) => setTimeout(r, 500));
        return "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("");
      case "wallet_switchEthereumChain":
        await new Promise((r) => setTimeout(r, 200));
        return null;
      default:
        throw new Error(`Unsupported: ${method}`);
    }
  },
};

export default function TestBridgePage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "waiting" | "ready" | "signed" | "error">("idle");
  const bridgeRef = useRef<ParentBridge | null>(null);

  function log(msg: string) {
    setLogs((prev) => [...prev, `[${new Date().toISOString().split("T")[1].slice(0, 8)}] ${msg}`]);
  }

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    log("Creating ParentBridge...");
    const bridge = createParentBridge({
      iframe,
      provider: mockProvider,
      address: MOCK_ADDRESS,
      chainId: MOCK_CHAIN_ID,
      onReady: () => {
        log("✓ ParentBridge ready — iframe received init");
        setStatus("ready");
      },
      onPaymentComplete: (checkoutId, txHash, paidAmount) => {
        log(`✓ Payment complete: txHash=${txHash}, paidAmount=${paidAmount}`);
        setStatus("signed");
      },
      onError: (checkoutId, reason) => {
        log(`✗ Error: ${reason}`);
        setStatus("error");
      },
    });

    bridge.start();
    bridgeRef.current = bridge;
    setStatus("waiting");
    log("Bridge started, waiting for iframe ready...");

    return () => {
      bridge.stop();
    };
  }, []);

  // Build iframe URL with a real checkout session
  // We'll create one via API call
  const [checkoutUrl, setCheckoutUrl] = useState<string>("");

  useEffect(() => {
    async function createSession() {
      try {
        const res = await fetch("/api/test-create-deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.checkoutId) {
          throw new Error(json?.error || "Failed to create session");
        }
        const params = new URLSearchParams({
          checkoutId: json.checkoutId,
          bridge: "1",
          theme: "dark",
          accent: "6d7cff",
          bgPage: "0c1017",
          bgCard: "12161f",
          border: "1d2432",
          textPrimary: "e6e9f2",
          textMuted: "8b93a7",
          borderRadius: "16",
        });
        setCheckoutUrl(`${CHECKOUT_ORIGIN}/checkout?${params.toString()}`);
        log(`Created checkout session: ${json.checkoutId}`);
      } catch (err) {
        log(`✗ Failed to create session: ${err instanceof Error ? err.message : String(err)}`);
        setStatus("error");
      }
    }
    createSession();
  }, []);

  return (
    <main className="min-h-screen bg-void p-6 text-slate-200">
      <h1 className="mb-4 text-xl font-semibold">Bridge Test Harness</h1>
      <div className="mb-4 flex gap-2">
        <span className={`rounded px-3 py-1 text-xs font-mono ${
          status === "idle" ? "bg-muted text-white" :
          status === "waiting" ? "bg-accent text-white" :
          status === "ready" ? "bg-green-600 text-white" :
          status === "signed" ? "bg-green-700 text-white" :
          "bg-red-600 text-white"
        }`}>
          {status.toUpperCase()}
        </span>
      </div>
      <div className="mb-4 h-48 overflow-auto rounded bg-panel p-3 font-mono text-xs">
        {logs.map((l, i) => (
          <div key={i} className="mb-1">{l}</div>
        ))}
      </div>
      {checkoutUrl ? (
        <iframe
          ref={iframeRef}
          src={checkoutUrl}
          className="w-full rounded-xl"
          style={{ height: "600px", border: "1px solid #1d2432" }}
          allow="clipboard-write; payment; web-share"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
        />
      ) : (
        <div className="flex h-96 items-center justify-center rounded-xl bg-panel">
          <span className="font-mono text-xs text-muted">Creating checkout session...</span>
        </div>
      )}
    </main>
  );
}
