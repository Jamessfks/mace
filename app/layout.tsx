import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MACE Force Fields | CS2535 Team 3 — Liquid Water & Tutorial 1",
  description:
    "MACE ML force fields for many-body atomic interactions. Liquid water report (DFT) and Tutorial 1: organic solvents DEC/EC (XTB). Team 3: Arya Baviskar, Isaac Sohn, Harshitha Somasundaram, Kartik Patri, Zicheng Zhao.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-black font-sans antialiased text-zinc-100`}
      >
        {children}
      </body>
    </html>
  );
}
