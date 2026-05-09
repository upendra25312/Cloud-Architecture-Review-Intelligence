import type { Metadata } from "next";
import HomeClientSection from "./components/HomeClientSection";

/**
 * Per-route metadata for the homepage.
 *
 * app/layout.tsx already declares the site-wide <title>, <meta description>,
 * Open Graph (og:title, og:description, og:type=website), and Twitter cards.
 * This export adds the canonical <link> required by Req 18.5 without
 * touching app/layout.tsx (forbidden by the feature's Preserved_Surfaces).
 */
export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return <HomeClientSection />;
}
