"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createParentBridge,
  type ParentBridge,
  IFRAME_ORIGIN,
  PROTOCOL_VERSION,
} from "@/lib/checkout-connect";

// The checkout iframe host is the same origin the bridge pins — reuse it rather
// than keep a second constant that can drift out of sync on a rename.
const CHECKOUT_ORIGIN = IFRAME_ORIGIN;
const API_BASE =
  process.env.NEXT_PUBLIC_HYPERMID_API_URL ?? "https://server.hypermid.io";

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
};

const getEthereum = (): EthereumProvider | undefined =>
  (window as unknown as { ethereum?: EthereumProvider }).ethereum;

type Status =
  | "idle"
  | "connecting"
  | "waiting"
  | "ready"
  | "paying"
  | "signed"
  | "error";

export default function TestBridgePage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const bridgeRef = useRef<ParentBridge | null>(null);

  // Wallet state
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isWalletConnecting, setIsWalletConnecting] = useState(false);

  // Session / iframe
  const [checkoutUrl, setCheckoutUrl] = useState<string>("");
  const [checkoutId, setCheckoutId] = useState<string>("");

  function log(msg: string) {
    const ts = new Date().toISOString().split("T")[1].slice(0, 8);
    setLogs((prev) => [...prev, `[${ts}] ${msg}`]);
  }

  // ── Wallet connect ────────────────────────────────────────────────────────
  const connectWallet = useCallback(async () => {
    const provider = getEthereum();
    if (!provider) {
      log("✗ No injected wallet found. Install MetaMask.");
      return;
    }
    setIsWalletConnecting(true);
    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const chainHex = (await provider.request({
        method: "eth_chainId",
      })) as string;
      const cid = parseInt(chainHex, 16);
      setWalletAddress(accounts[0] ?? null);
      setChainId(cid);
      log(`Connected: ${accounts[0]} on chain ${cid}`);
    } catch (err) {
      log(
        `✗ Connection failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsWalletConnecting(false);
    }
  }, []);

  // Listen for wallet changes
  useEffect(() => {
    const provider = getEthereum();
    if (!provider?.on) return;
    const handleChainChanged = (chainId: unknown) => {
      const cid = parseInt(String(chainId), 16);
      setChainId(cid);
      log(`Wallet chain changed: ${cid}`);
    };
    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) {
        setWalletAddress(null);
        setChainId(null);
        log("Wallet disconnected");
      } else {
        setWalletAddress(accs[0]);
        log(`Wallet account changed: ${accs[0]}`);
      }
    };
    provider.on("chainChanged", handleChainChanged);
    provider.on("accountsChanged", handleAccountsChanged);
    return () => {
      provider.removeListener?.("chainChanged", handleChainChanged);
      provider.removeListener?.(
        "accountsChanged",
        handleAccountsChanged,
      );
    };
  }, []);

  // ── Session creation ──────────────────────────────────────────────────────
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
        setCheckoutId(json.checkoutId);
        setCheckoutUrl(`${CHECKOUT_ORIGIN}/checkout?${params.toString()}`);
        log(`Created session: ${json.checkoutId}`);
      } catch (err) {
        log(
          `✗ Session creation failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        setStatus("error");
      }
    }
    createSession();
  }, []);

  // ── Bridge init ───────────────────────────────────────────────────────────
  const initBridge = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (bridgeRef.current) return;
    if (!walletAddress || !chainId) {
      log("Bridge init skipped — wallet not connected");
      return;
    }

    log("Creating ParentBridge...");
    const bridge = createParentBridge({
      iframe,
      provider: getEthereum()!,
      address: walletAddress as `0x${string}`,
      chainId,
      apiBase: API_BASE,
      onReady: () => {
        log("✓ ParentBridge ready — iframe received init");
        setStatus("ready");
      },
      onPaymentComplete: (cid, txHash, paidAmount) => {
        log(`✓ Payment complete: txHash=${txHash}, paidAmount=${paidAmount}`);
        setStatus("signed");
      },
      onError: (cid, reason) => {
        log(`✗ Error (${cid}): ${reason}`);
        setStatus("error");
      },
    });

    bridge.start();
    bridgeRef.current = bridge;
    setStatus("waiting");
    log("Bridge started, waiting for iframe ready...");
  }, [walletAddress, chainId]);

  // Re-init bridge if wallet changes after initial load
  useEffect(() => {
    if (bridgeRef.current && walletAddress && chainId) {
      bridgeRef.current.sendAddressChanged(
        walletAddress as `0x${string}`,
        chainId,
      );
    }
  }, [walletAddress, chainId]);

  // ── Guard tests ───────────────────────────────────────────────────────────
  const testWrongOrigin = useCallback(() => {
    log("[TEST] Dispatching fake message from https://evil.com ...");
    const ev = new MessageEvent("message", {
      origin: "https://evil.com",
      data: { type: "hypermid:ready", version: PROTOCOL_VERSION },
      source: window,
    });
    window.dispatchEvent(ev);
    log("[TEST] Fake message dispatched. Parent should ignore it (check logs above).");
  }, []);

  const testStaleCorrelationId = useCallback(() => {
    log("[TEST] Posting stale sign-result to iframe ...");
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      log("[TEST] No iframe to target");
      return;
    }
    iframe.contentWindow.postMessage(
      {
        type: "hypermid:sign-result",
        version: PROTOCOL_VERSION,
        id: "stale-correlation-id-99999",
        txHash: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      },
      IFRAME_ORIGIN,
    );
    log("[TEST] Stale sign-result posted. Iframe should ignore it.");
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  const canShowIframe = checkoutUrl && walletAddress;

  return (
    <main className="min-h-screen bg-void p-6 text-slate-200">
      <h1 className="mb-4 text-xl font-semibold">
        Bridge Test Harness — Real Wallet
      </h1>

      {/* Status badge */}
      <div className="mb-4 flex gap-2">
        <span
          className={`rounded px-3 py-1 text-xs font-mono ${
            status === "idle" || status === "connecting"
              ? "bg-edge text-muted"
              : status === "waiting"
                ? "bg-accent-dim text-white"
                : status === "ready"
                  ? "bg-green-600 text-white"
                  : status === "paying"
                    ? "bg-accent text-white"
                    : status === "signed"
                      ? "bg-green-700 text-white"
                      : "bg-red-600 text-white"
          }`}
        >
          {status.toUpperCase()}
        </span>
        {checkoutId && (
          <span className="rounded bg-panel px-3 py-1 font-mono text-xs text-muted">
            {checkoutId}
          </span>
        )}
      </div>

      {/* Wallet + guard tests */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {!walletAddress ? (
          <button
            onClick={connectWallet}
            disabled={isWalletConnecting}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dim disabled:opacity-50"
          >
            {isWalletConnecting ? "Connecting..." : "Connect Wallet (MetaMask)"}
          </button>
        ) : (
          <>
            <span className="rounded bg-panel px-3 py-1 font-mono text-xs text-green-400">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)} · chain{" "}
              {chainId}
            </span>
            <button
              onClick={testWrongOrigin}
              className="rounded border border-edge px-3 py-1 text-xs text-muted hover:text-white"
            >
              Test wrong origin
            </button>
            <button
              onClick={testStaleCorrelationId}
              className="rounded border border-edge px-3 py-1 text-xs text-muted hover:text-white"
            >
              Test stale corr-id
            </button>
          </>
        )}
      </div>

      {/* Log panel */}
      <div className="mb-4 h-56 overflow-auto rounded bg-panel p-3 font-mono text-xs">
        {logs.length === 0 && (
          <div className="text-muted">Logs will appear here...</div>
        )}
        {logs.map((l, i) => (
          <div key={i} className="mb-1 break-all">
            {l}
          </div>
        ))}
      </div>

      {/* Iframe or placeholder */}
      {canShowIframe ? (
        <iframe
          ref={iframeRef}
          src={checkoutUrl}
          onLoad={initBridge}
          className="w-full rounded-xl"
          style={{ height: "600px", border: "1px solid #1d2432" }}
          allow="clipboard-write; payment; web-share"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
        />
      ) : (
        <div className="flex h-96 items-center justify-center rounded-xl bg-panel">
          <span className="font-mono text-xs text-muted">
            {!checkoutUrl
              ? "Creating checkout session..."
              : "Connect wallet to load bridge"}
          </span>
        </div>
      )}
    </main>
  );
}
