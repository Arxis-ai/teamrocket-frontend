import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Plus Jakarta Sans for everything readable — geometric, slightly rounded,
// and noticeably more contemporary than the previous Geist pairing.
// No explicit weight: both are variable fonts, so the whole 200–800 range
// is available and every font-medium/semibold/bold class resolves properly.
const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

// JetBrains Mono only for the technical chrome: batch ids, the clock, and
// the node labels in the trust graph.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Reality Show — Director's Dashboard",
  description: "Cockpit dashboard for the autonomous AI reality show",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakartaSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
