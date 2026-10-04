import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import "./globals.css";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
  title: "SPECLOCK: semantic change adjudication for software specifications",
  description:
    "Freeze the requirements an integration depends on, then let GenLayer validators decide "
    + "whether a proposed specification change preserves or violates them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
