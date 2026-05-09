"use client";

import Link from "next/link";
import { useAuthSession } from "@/components/auth-session-provider";

export default function ExplorerAuthCta() {
  const { resolved, signedIn } = useAuthSession();

  if (!resolved) {
    return null;
  }

  if (signedIn) {
    return (
      <Link href="/arb" className="primary-button">
        Start a real review →
      </Link>
    );
  }

  return (
    <span
      className="chip"
      title="The Azure Service Explorer is fully usable without signing in. Sign in is only required for the ARB review workflow."
      aria-label="No sign-in required to use the explorer"
    >
      No sign-in required
    </span>
  );
}
