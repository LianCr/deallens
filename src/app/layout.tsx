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
    default: "DealLens — Is this price fair?",
    template: "%s · DealLens",
  },
  description:
    "Pricing as context, not a number: see where a dealer quote lands in the market distribution, how prices moved over 24 months, and why.",
  openGraph: {
    title: "DealLens — Is this price fair?",
    description:
      "Pricing as context, not a number: market distribution, 24-month history, honest data labels.",
    url: siteUrl,
    siteName: "DealLens",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DealLens — Is this price fair?",
    description:
      "Pricing as context, not a number: market distribution, 24-month history, honest data labels.",
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
