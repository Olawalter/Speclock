"use client";

import { useCallback, useState } from "react";

import { useWallet } from "@/components/wallet/wallet-provider";
import type { Call } from "@/lib/genlayer/contract";
import { initialTx, runWrite, type TxState } from "@/lib/genlayer/transaction";

/**
 * One place that sends a write, so every form follows the same lifecycle and
 * nothing invents its own idea of what "done" means.
 */
export function useSend() {
  const { wallet, wrongNetwork, clientFor } = useWallet();
  const [tx, setTx] = useState<TxState>(initialTx);

  const send = useCallback(async (
    call: Call,
    options: { onSettled?: (hash: string) => Promise<void> | void } = {},
  ) => {
    if (!wallet || wrongNetwork) return initialTx;
    const client = clientFor(wallet.provider) as never;
    return runWrite(client, call, setTx, options);
  }, [wallet, wrongNetwork, clientFor]);

  const reset = useCallback(() => setTx(initialTx), []);

  return { tx, send, reset, canSend: Boolean(wallet) && !wrongNetwork };
}

/** The reason a write cannot be sent right now, in words. */
export function sendBlocker(wallet: unknown, wrongNetwork: boolean): string {
  if (!wallet) return "Connect a wallet to send this.";
  if (wrongNetwork) return "Your wallet is on another network. Switch it to continue.";
  return "";
}
