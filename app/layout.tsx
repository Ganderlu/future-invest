import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { LiveChatWidget } from "@/components/live-chat-widget";
import { TawkChat } from "@/components/tawk-chat";
import { FloatingTranslate } from "@/components/floating-translate";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Premium Investment Platform",
  description:
    "A modern investment platform with tailored plans, insights, and secure account access.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.className} antialiased bg-slate-950 text-slate-50`}
      >
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <LiveChatWidget />
          <TawkChat />
          <FloatingTranslate />
        </div>
      </body>
    </html>
  );
}
