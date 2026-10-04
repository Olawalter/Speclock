"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { configResult, explorerAddress } from "@/lib/config/env";
import { WalletProvider } from "@/components/wallet/wallet-provider";
import { WalletButton } from "@/components/wallet/wallet-button";
import { Mark } from "@/components/mark";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/specifications", label: "Specifications" },
  { href: "/assessments", label: "Assessments" },
  { href: "/docs", label: "Protocol" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <Frame>{children}</Frame>
    </WalletProvider>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>

      {/* On a phone the nav takes a row of its own. Squeezed between the
          wordmark and the wallet it collapses to a couple of clipped letters. */}
      <header className="sticky top-0 z-20 border-b bg-[var(--paper)]/92 backdrop-blur">
        <div className="shell grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 py-3
                        md:flex md:h-14 md:gap-8 md:py-0">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="SPECLOCK, home">
            <Mark className="h-6 w-6" />
            <span className="text-[15px] font-[560] tracking-[0.14em]">SPECLOCK</span>
          </Link>
          <div className="justify-self-end md:order-last">
            <WalletButton />
          </div>
          <nav className="no-scrollbar col-span-2 flex min-w-0 gap-1 overflow-x-auto
                          md:col-span-1 md:flex-1"
               aria-label="Sections">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}
                    aria-current={active(item.href) ? "page" : undefined}
                    className={`shrink-0 rounded-[6px] px-3 py-1.5 text-sm transition-colors ${
                      active(item.href)
                        ? "bg-white text-[var(--graphite)]"
                        : "text-[var(--slate)] hover:text-[var(--graphite)]"}`}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" className="shell flex-1 py-10 md:py-12">{children}</main>

      <footer className="rule mt-16">
        <div className="shell grid gap-3 py-8 text-xs text-[var(--slate)]
                        md:grid-cols-[1fr_auto] md:items-end">
          <p className="max-w-xl">
            Adjudication by GenLayer validator consensus. The contract is authoritative; this
            console reads it and composes transactions a wallet signs. It decides nothing.
          </p>
          {configResult.ok ? (
            <p className="md:text-right">
              Studio Next, chain {configResult.config.chainId}
              <br />
              <a className="mono hover:text-[var(--graphite)]"
                 href={explorerAddress(configResult.config.contractAddress)}
                 target="_blank" rel="noreferrer">
                {configResult.config.contractAddress}
              </a>
            </p>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
