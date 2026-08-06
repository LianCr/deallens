import type { Metadata } from "next";
import { Familjen_Grotesk, IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";
import { Header } from "@/components/shell/Header";
import { Footer } from "@/components/shell/Footer";
import "./globals.css";

const display = Familjen_Grotesk({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Source_Sans_3({
  variable: "--font-body-face",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const siteUrl = "https://deallens-xi.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "DealLens — Is this actually a good deal?",
    template: "%s · DealLens",
  },
  description:
    "Evidence-backed price intelligence for high-consideration purchases, starting with used cars. Compare citable offers, see the math, get a grounded recommendation.",
  openGraph: {
    title: "DealLens — Is this actually a good deal?",
    description:
      "Research the market, compare real offers, and explain whether a purchase is a good deal — starting with used cars.",
    url: siteUrl,
    siteName: "DealLens",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DealLens — Is this actually a good deal?",
    description:
      "Evidence-backed price intelligence for used cars: citable comparables, Trust Trace, grounded AI.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
