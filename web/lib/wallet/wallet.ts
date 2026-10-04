/**
 * Injected wallets, discovered rather than assumed.
 *
 * EIP-6963 lets every installed wallet announce itself, so the person picks
 * rather than the console deciding that whatever claimed `window.ethereum`
 * first is the one they meant. MetaMask, Rabby and anything else compatible
 * turn up the same way, and nothing here names a brand.
 */
import { CHAIN_ID } from "@/lib/genlayer/client";

export type WalletInfo = { uuid: string; name: string; icon: string; rdns: string };
export type Wallet = { info: WalletInfo; provider: Eip1193 };

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (payload: unknown) => void) => void;
  removeListener?: (event: string, handler: (payload: unknown) => void) => void;
};

const REMEMBERED = "speclock.wallet";

/**
 * Listen for wallets announcing themselves, and ask them to.
 * Returns a teardown, and keeps listening: a wallet can announce late.
 */
export function discoverWallets(onChange: (wallets: Wallet[]) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const found = new Map<string, Wallet>();

  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent).detail as Wallet | undefined;
    if (!detail?.info?.uuid || found.has(detail.info.uuid)) return;
    found.set(detail.info.uuid, detail);
    onChange([...found.values()]);
  };

  window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  // A wallet that predates EIP-6963 only ever appears on window.ethereum. It is
  // included so those people are not simply told they have no wallet.
  const legacy = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  if (legacy && found.size === 0) {
    found.set("injected", {
      info: { uuid: "injected", name: "Injected wallet", icon: "", rdns: "injected" },
      provider: legacy,
    });
    onChange([...found.values()]);
  }

  return () => window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
}

/** Accounts, asking only when the person has asked. */
export async function accountsOf(provider: Eip1193, ask: boolean): Promise<string[]> {
  const method = ask ? "eth_requestAccounts" : "eth_accounts";
  const accounts = (await provider.request({ method })) as string[] | undefined;
  return Array.isArray(accounts) ? accounts : [];
}

export async function chainOf(provider: Eip1193): Promise<number> {
  const id = (await provider.request({ method: "eth_chainId" })) as string;
  return Number.parseInt(String(id), 16);
}

/** Offer the network, and add it if the wallet has never heard of it. */
export async function switchChain(provider: Eip1193): Promise<void> {
  const hex = `0x${CHAIN_ID.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (problem) {
    const code = (problem as { code?: number })?.code;
    if (code !== 4902) throw problem;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: hex,
        chainName: "GenLayer Studio Next",
        nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
        rpcUrls: ["https://studio-dev.genlayer.com/api"],
        blockExplorerUrls: ["https://explorer-studio-dev.genlayer.com"],
      }],
    });
  }
}

export function rememberWallet(rdns: string): void {
  try { window.localStorage.setItem(REMEMBERED, rdns); } catch { /* private window */ }
}

export function rememberedWallet(): string | null {
  try { return window.localStorage.getItem(REMEMBERED); } catch { return null; }
}

export function forgetWallet(): void {
  try { window.localStorage.removeItem(REMEMBERED); } catch { /* private window */ }
}

/** What went wrong, in words a person can act on. */
export function walletProblem(problem: unknown): string {
  const code = (problem as { code?: number })?.code;
  if (code === 4001) return "You declined the request in your wallet.";
  if (code === -32002) return "Your wallet is already asking. Open it to continue.";
  const message = String((problem as { message?: string })?.message ?? problem ?? "");
  if (/user rejected/i.test(message)) return "You declined the request in your wallet.";
  return message.slice(0, 200) || "The wallet did not respond.";
}
