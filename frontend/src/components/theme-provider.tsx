"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { AuthStatusChip } from "@/components/auth-status-chip";
import { TelemetryInit } from "@/components/telemetry-init";
import { SITE_NAME } from "@/lib/site";

type NavItem = {
  href: Route;
  label: string;
  matchPrefixes?: string[];
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/arb" as Route,
    label: "Architecture Review",
    matchPrefixes: ["/arb", "/decision-center"],
  },
  {
    href: "/services" as Route,
    label: "Azure Service Explorer",
    matchPrefixes: ["/services", "/technologies"],
  },
  {
    href: "/demo" as Route,
    label: "Demo",
    matchPrefixes: ["/demo"],
  },
];

function matchesNavItem(pathname: string, item: NavItem) {
  if (item.href === pathname) return true;
  return item.matchPrefixes?.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ?? false;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  // Always light — apply once on mount, no toggle
  useEffect(() => {
    document.documentElement.removeAttribute("data-theme");
  }, []);

  return (
    <AuthSessionProvider>
      <TelemetryInit />
      <div className={`page-shell${isHome ? " page-shell-home" : ""}`}>
        <header className="topbar">
          <div className="topbar-inner">
            {/* Brand */}
            <Link href="/" className="topbar-brand" aria-label={SITE_NAME}>
              <img src="/rackspace-icon.jpg" alt="" className="topbar-brand-logo" />
              <span className="topbar-brand-name">{SITE_NAME}</span>
            </Link>

            {/* Spacer */}
            <div aria-hidden="true" />

            {/* Primary nav */}
            <nav className="topbar-nav" aria-label="Primary sections">
              {NAV_ITEMS.map((item) => {
                const active = matchesNavItem(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`topbar-nav-item${active ? " topbar-nav-item--active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Sign in / avatar */}
            <div className="topbar-actions">
              <AuthStatusChip />
            </div>
          </div>
        </header>

        {children}

        <footer className="site-footer">
          <div className="site-footer-inner">
            {/* Brand + mission */}
            <div className="site-footer-brand">
              <img src="/rackspace-icon.jpg" alt="Rackspace logo" className="site-footer-logo" />
              <span className="site-footer-brand-name">Cloud Architecture Review Intelligence</span>
              <p className="site-footer-brand-desc">
                Evidence-backed Azure review guidance for internal Rackspace teams. Aligned to Microsoft Well-Architected Framework, CAF, ALZ, and Zero Trust.
              </p>
              {/* Updated footer copy for enterprise branding */}
              <p className="site-footer-legal">© {new Date().getFullYear()} Rackspace Technology. Internal use only.</p>
            </div>

            {/* Trust links */}
            <div className="site-footer-links">
              <p className="site-footer-link-group-label">Product</p>
              <a href="/demo" className="site-footer-link">Demo Review</a>
              <a href="/arb" className="site-footer-link">Start a Review</a>
              <a href="/services" className="site-footer-link">Azure Service Explorer</a>
            </div>

            <div className="site-footer-links">
              <p className="site-footer-link-group-label">Resources</p>
              <a href="https://github.com/upendra25312/Cloud-Architecture-Review-Intelligence" target="_blank" rel="noopener noreferrer" className="site-footer-link">GitHub</a>
              <a href="https://github.com/upendra25312/Cloud-Architecture-Review-Intelligence/wiki" target="_blank" rel="noopener noreferrer" className="site-footer-link">Wiki</a>
              <a href="https://github.com/upendra25312/Cloud-Architecture-Review-Intelligence/releases" target="_blank" rel="noopener noreferrer" className="site-footer-link">Releases</a>
            </div>

            <div className="site-footer-links">
              <p className="site-footer-link-group-label">Trust &amp; Security</p>
              <a href="https://github.com/upendra25312/Cloud-Architecture-Review-Intelligence/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer" className="site-footer-link">Security Policy</a>
              <span className="site-footer-notice">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true" style={{display:"inline",verticalAlign:"-2px",marginRight:4}}><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2"/><path d="M6.5 4v3.5M6.5 9v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                Internal Rackspace use only
              </span>
              <span className="site-footer-notice">Human sign-off required for review decisions</span>
            </div>
          </div>

          <div className="site-footer-copy">
            <span>© 2026 Rackspace Technology. Rackspace Cloud Architecture Review Intelligence v0.1.0.</span>
            <span className="site-footer-copy-sep">·</span>
            <span>Built on Azure Static Web Apps · Microsoft Learn-backed guidance · Rackspace internal use</span>
          </div>
        </footer>
      </div>
    </AuthSessionProvider>
  );
}
