import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const SITE_URL = "https://thankful-pond-04383960f.7.azurestaticapps.net";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`
  },
  description: SITE_DESCRIPTION,
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" }
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png"
  },
  manifest: "/site.webmanifest",
  themeColor: "#E21B2D",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [{ url: "/arb-workflow.png", width: 1200, height: 630, alt: `${SITE_NAME} — evidence-to-decision workflow` }]
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/arb-workflow.png"]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true }
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preload the header logo (LCP candidate on every page) */}
        <link rel="preload" href="/rackspace-logo-red.png" as="image" type="image/png" />
      </head>
      <body className={inter.variable}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
