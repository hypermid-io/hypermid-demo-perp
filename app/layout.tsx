import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Demo Perp — Hypermid",
  description:
    "Reference integration: Hypermid deposits + withdrawals on a demo perp platform.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geist.variable} ${geistMono.variable} min-h-screen bg-void font-sans text-slate-200 antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
