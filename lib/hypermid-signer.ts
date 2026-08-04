/**
 * CR-284 M4 — resolve a Hypermid signer from the user's Privy wallet.
 *
 * demo-perp is the live proof of the CR-284 signer-injection work: the same
 * `HypermidCheckout.pay()` call drives checkout, open deposit, and withdrawal
 * against EITHER Privy wallet type, with no branching in the calling component.
 *
 * TWO PATHS, both from @hypermid/checkout/adapters:
 *
 *   • SMART WALLET (ERC-4337) — preferred when provisioned. Gas is sponsored by
 *     the paymaster the Smart Wallet client was built with, so the user pays
 *     NO GAS. This is the fun.xyz/FunKit model.
 *
 *   • EMBEDDED EOA — the fallback. Works today, user pays their own gas.
 *
 * ⚠️ SETUP DEPENDENCY for the gasless path: the Privy app must have Smart
 * Wallets ENABLED and a FUNDED PAYMASTER configured in the Privy dashboard.
 * Without that, `useSmartWallets().client` is undefined and this falls back to
 * the EOA (user pays gas) — or, if a paymaster is configured but unfunded,
 * sponsored sends fail at send time. That is dashboard config, not code. If the
 * gasless acceptance test shows gas being charged, check there first.
 */

import type { HypermidEvmSigner } from "@hypermid/checkout/adapters";
import {
  hypermidSignerFromPrivy,
  hypermidSignerFromPrivySmart,
} from "@hypermid/checkout/adapters";

/** Which wallet actually backed the signer — surfaced in the UI so the gasless
 *  acceptance test can be read off the screen rather than inferred. */
export type SignerKind = "smart" | "eoa";

export interface ResolvedSigner {
  signer: HypermidEvmSigner;
  kind: SignerKind;
  /** True only for the sponsored 4337 path. Drives the "no gas" badge. */
  gasless: boolean;
  address: string;
}

/**
 * Structural shapes, deliberately LOOSE.
 *
 * Privy's real `SmartWalletsInterface` / `ConnectedWallet` are large generic
 * types (`SmartWalletClientTypeWithSwitchChain` is a permissionless
 * `SmartAccountClient`), and a narrow hand-written mirror does not structurally
 * match them — TS rejects the assignment outright. Since this module only READS
 * two fields to decide which adapter to build, and the adapters do their own
 * structural typing, the honest shape here is "an object that may have these
 * fields" rather than a false-precision mirror.
 */
interface SmartLike {
  client?: unknown;
  getClientForChain?: unknown;
}
interface PrivyWalletLike {
  address: string;
  walletClientType?: string;
}

/** Narrow an unknown Privy smart client to just the field we read. */
function smartAddressOf(client: unknown): string | undefined {
  const acct = (client as { account?: { address?: unknown } } | undefined)?.account;
  return typeof acct?.address === "string" ? acct.address : undefined;
}

/**
 * Prefer the sponsored Smart Wallet; fall back to the embedded EOA.
 *
 * @param smart  `useSmartWallets()` — may be undefined if the provider isn't mounted.
 * @param wallets `useWallets().wallets`
 */
export function resolveHypermidSigner(
  smart: SmartLike | undefined,
  wallets: readonly PrivyWalletLike[] | undefined,
): ResolvedSigner | null {
  // 1. Smart Wallet (gasless) when the client is live.
  const smartAddr = smartAddressOf(smart?.client);
  if (smart?.client && smartAddr) {
    return {
      signer: hypermidSignerFromPrivySmart(smart as never),
      kind: "smart",
      gasless: true,
      address: smartAddr,
    };
  }

  // 2. Embedded EOA fallback. `walletClientType === 'privy'` is the embedded
  //    wallet specifically — an external wallet the user connected through
  //    Privy would also appear here and is a valid signer, but we prefer the
  //    embedded one so the demo exercises the intended UX.
  const list = wallets ?? [];
  const embedded = list.find((w) => w.walletClientType === "privy") ?? list[0];
  if (embedded) {
    return {
      signer: hypermidSignerFromPrivy(embedded as never),
      kind: "eoa",
      gasless: false,
      address: embedded.address,
    };
  }

  return null;
}
