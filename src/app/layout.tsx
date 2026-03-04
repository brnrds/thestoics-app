import type { Metadata } from "next";
import { Newsreader, Source_Serif_4, DM_Sans } from "next/font/google";
import "./globals.css";

const displayFont = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const bodyFont = Source_Serif_4({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const uiFont = DM_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Confer with the Stoics",
  description: "Mode-aware Stoic conversations with shared RAG citations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${uiFont.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
