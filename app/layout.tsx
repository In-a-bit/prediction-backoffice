import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import { MobileBar, Sidebar } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prediction Backoffice",
  description:
    "Operate prediction markets across automation types — crypto intervals, manual, sports — and browse the resulting events and markets.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <MobileBar />
            <main className="flex-1 w-full max-w-7xl mx-auto px-6 lg:px-10 py-8">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
