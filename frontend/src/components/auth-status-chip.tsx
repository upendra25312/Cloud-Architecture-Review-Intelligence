"use client";

import Link from "next/link";
import { useAuthSession } from "@/components/auth-session-provider";
import {
  ENABLED_AUTH_PROVIDERS,
  buildLoginUrl,
  buildLogoutUrl,
  formatIdentityProvider
} from "@/lib/review-cloud";

export function AuthStatusChip() {
  const { principal, resolved } = useAuthSession();

  if (!resolved) {
    return null;
  }

  if (!principal) {
    return (
      <div className="auth-chip-group">
        {ENABLED_AUTH_PROVIDERS.map((provider) => (
          <a
            key={provider.id}
            href={buildLoginUrl(provider.id)}
            className="auth-chip"
            title={`Sign in with ${provider.label}`}
          >
            Sign in with {provider.label}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="auth-chip-group">
      <details className="auth-menu">
        <summary className="auth-chip auth-chip-signed-in">
          <span className="auth-chip-label">Account</span>
          <span className="auth-chip-value">{principal.userDetails || principal.userId}</span>
        </summary>
        <div className="auth-menu-panel">
          <p className="microcopy">
            Signed in with {formatIdentityProvider(principal.identityProvider)} as{" "}
            {principal.userDetails || principal.userId}.
          </p>
          <div className="auth-menu-actions">
            <Link href="/arb" className="primary-button">
              Architecture Review
            </Link>
            <Link href="/services" className="secondary-button">
              Azure Service Explorer
            </Link>
            <a href={buildLogoutUrl("/")} className="ghost-button">
              Sign out
            </a>
          </div>
        </div>
      </details>
      <a href={buildLogoutUrl("/")} className="ghost-button auth-signout-button">
        Sign out
      </a>
    </div>
  );
}
