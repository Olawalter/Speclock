"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { configResult } from "@/lib/config/env";
import { CHAIN_ID, writeClient } from "@/lib/genlayer/client";
import {
  accountsOf, chainOf, discoverWallets, forgetWallet, rememberWallet, rememberedWallet,
  switchChain, walletProblem, type Wallet,
} from "@/lib/wallet/wallet";

type WalletState = {
  wallets: Wallet[];
  wallet: Wallet | undefined;
  account: string | undefined;
  chainId: number | undefined;
  wrongNetwork: boolean;
  connecting: boolean;
  problem: string | undefined;
  connect: (wallet: Wallet) => Promise<void>;
  disconnect: () => void;
  fixNetwork: () => Promise<void>;
  clientFor: (provider: unknown) => ReturnType<typeof writeClient>;
};

const WalletContext = createContext<WalletState | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [wallet, setWallet] = useState<Wallet>();
  const [account, setAccount] = useState<string>();
  const [chainId, setChainId] = useState<number>();
  const [connecting, setConnecting] = useState(false);
  const [problem, setProblem] = useState<string>();

  useEffect(() => discoverWallets(setWallets), []);

  const attach = useCallback(async (found: Wallet, ask: boolean) => {
    const accounts = await accountsOf(found.provider, ask);
    if (accounts.length === 0) return false;
    setWallet(found);
    setAccount(accounts[0]);
    setChainId(await chainOf(found.provider));
    rememberWallet(found.info.rdns);
    return true;
  }, []);

  // Reconnect silently to the wallet this browser used last, if it still
  // remembers this site. A wallet that announces late is picked up here too.
  useEffect(() => {
    const chosen = rememberedWallet();
    if (!chosen || wallet) return;
    const found = wallets.find((w) => w.info.rdns === chosen);
    if (!found) return;
    // attach reaches a setState only after awaiting the wallet, so nothing here
    // is a synchronous set. A silent reconnect that fails stays silent: nobody
    // asked for it, so there is nothing to tell them about.
    void (async () => { await attach(found, false).catch(() => false); })();
  }, [wallets, wallet, attach]);

  useEffect(() => {
    const provider = wallet?.provider;
    if (!provider?.on) return;
    const onAccounts = (payload: unknown) => {
      const accounts = payload as string[];
      if (!accounts?.length) {
        setAccount(undefined);
        setWallet(undefined);
        forgetWallet();
      } else {
        setAccount(accounts[0]);
      }
    };
    const onChain = (payload: unknown) => setChainId(Number.parseInt(String(payload), 16));
    const onDisconnect = () => {
      setAccount(undefined);
      setWallet(undefined);
      forgetWallet();
    };
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    provider.on("disconnect", onDisconnect);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
      provider.removeListener?.("disconnect", onDisconnect);
    };
  }, [wallet]);

  const connect = useCallback(async (chosen: Wallet) => {
    setProblem(undefined);
    setConnecting(true);
    try {
      const attached = await attach(chosen, true);
      if (!attached) setProblem("That wallet returned no accounts.");
    } catch (trouble) {
      setProblem(walletProblem(trouble));
    } finally {
      setConnecting(false);
    }
  }, [attach]);

  const disconnect = useCallback(() => {
    setWallet(undefined);
    setAccount(undefined);
    setChainId(undefined);
    setProblem(undefined);
    forgetWallet();
  }, []);

  const fixNetwork = useCallback(async () => {
    if (!wallet) return;
    setProblem(undefined);
    try {
      await switchChain(wallet.provider);
      setChainId(await chainOf(wallet.provider));
    } catch (trouble) {
      setProblem(walletProblem(trouble));
    }
  }, [wallet]);

  const value = useMemo<WalletState>(() => ({
    wallets,
    wallet,
    account,
    chainId,
    wrongNetwork: Boolean(wallet) && chainId !== undefined
      && chainId !== (configResult.ok ? configResult.config.chainId : CHAIN_ID),
    connecting,
    problem,
    connect,
    disconnect,
    fixNetwork,
    clientFor: writeClient,
  }), [wallets, wallet, account, chainId, connecting, problem, connect, disconnect, fixNetwork]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider");
  return value;
}
