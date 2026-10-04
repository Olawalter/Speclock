"use client";

import { useState } from "react";

import { shortAddress } from "@/lib/format/present";
import { useWallet } from "@/components/wallet/wallet-provider";

export function WalletButton() {
  const { wallets, wallet, account, wrongNetwork, connecting, problem, connect, disconnect,
          fixNetwork } = useWallet();
  const [open, setOpen] = useState(false);

  if (wallet && account) {
    return (
      <div className="flex items-center gap-2">
        {wrongNetwork ? (
          <button type="button" className="btn chip-pending border-transparent"
                  onClick={() => void fixNetwork()}>
            Wrong network, switch
          </button>
        ) : null}
        <button type="button" className="btn btn-quiet mono text-xs"
                onClick={disconnect}
                title="Disconnect this wallet from the console">
          {shortAddress(account)}
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button type="button" className="btn" onClick={() => setOpen((v) => !v)}
              aria-expanded={open} aria-haspopup="menu" disabled={connecting}>
        {connecting ? "Connecting…" : "Connect a wallet"}
      </button>
      {open ? (
        <div role="menu"
             className="panel absolute right-0 z-30 mt-2 w-64 p-1 shadow-sm">
          {wallets.length === 0 ? (
            <p className="p-3 text-xs text-[var(--slate)]">
              No wallet announced itself. Install an injected wallet, or unlock the one you have,
              then reload.
            </p>
          ) : wallets.map((candidate) => (
            <button key={candidate.info.uuid} type="button" role="menuitem"
                    className="flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2
                               text-left text-sm hover:bg-[var(--paper)]"
                    onClick={() => { setOpen(false); void connect(candidate); }}>
              {candidate.info.icon
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={candidate.info.icon} alt="" className="h-5 w-5 rounded" />
                : <span className="h-5 w-5 rounded bg-[var(--border)]" />}
              {candidate.info.name}
            </button>
          ))}
          {problem ? (
            <p role="alert" className="px-2.5 pb-2 pt-1 text-xs text-[var(--breaking-ink)]">
              {problem}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
