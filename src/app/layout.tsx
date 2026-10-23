import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Suspense } from "react";

import { Account } from "@/app/account";
import { TopBar } from "@/components/app-shell/top-bar";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Designer",
  description: "Design a project's architecture and expose it to coding agents over MCP.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="flex h-dvh flex-col">
        <Providers>
          <TopBar
            account={
              <Suspense fallback={<div className="ml-auto" />}>
                <Account />
              </Suspense>
            }
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
