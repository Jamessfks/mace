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
  title: "MACE Force Fields | CS2535 Team 3 — Liquid Water",
  description:
    "MACE machine learning for predicting many-body atomic interactions and generating force fields. Liquid water training results. Team 3: Arya Baviskar, Isaac Sohn, Harshitha Somasundaram, Kartik Patri, Zicheng Zhao.",
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
