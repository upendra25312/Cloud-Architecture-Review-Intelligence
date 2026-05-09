"use client";

import Link from "next/link";
import type { Route } from "next";
import { useAuthSession } from "@/components/auth-session-provider";
import { buildPrimaryLoginUrl } from "@/lib/review-cloud";

export default function Header() {
  const { principal, signedIn } = useAuthSession();

  return (
    <header className="page-header-home">
      <div className="home-header-main">
        <Link href="/" className="home-brand-link" aria-label="Rackspace Cloud Architecture Review Intelligence Home">
          <img src="/rackspace-logo-red.png" alt="Rackspace Technology" className="home-brand-wordmark" height={28} decoding="async" fetchPriority="high" />
          <span className="home-brand-badge">Internal</span>
        </Link>
        <nav className="home-link-nav" aria-label="Main navigation">
          <Link href="/arb" className="home-link-nav-item">Architecture Review</Link>
          <Link href="/services" className="home-link-nav-item">Azure Service Explorer</Link>
          <Link href={"/demo" as Route} className="home-link-nav-item">Demo</Link>
        </nav>
      </div>
      <div className="home-header-actions">
        <Link href="/how-to-use" className="home-link-nav-item" aria-label="Help">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5"/><path d="M7.5 7.5a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3.5M10 15h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </Link>
        {signedIn ? (
          <div className="account-dropdown">
            <button className="avatar-button" aria-label="Account menu">
              <span className="avatar">{principal?.userDetails?.[0] ?? "U"}</span>
              <span className="username">{principal?.userDetails ?? "Account"}</span>
              <span aria-hidden>▼</span>
            </button>
            {/* Dropdown menu (Profile, Settings, Sign out) can be implemented here */}
          </div>
        ) : (
          <a href={buildPrimaryLoginUrl()} className="home-link-nav-item">Sign in</a>
        )}
      </div>
    </header>
  );
}
