"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { readClientPrincipal } from "@/lib/review-cloud";
import type { StaticWebAppClientPrincipal } from "@/types";

type AuthSessionContextValue = {
  principal: StaticWebAppClientPrincipal | null;
  resolved: boolean;
  signedIn: boolean;
  refresh: () => Promise<StaticWebAppClientPrincipal | null>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const [principal, setPrincipal] = useState<StaticWebAppClientPrincipal | null>(null);
  const [resolved, setResolved] = useState(false);
  const activeRef = useRef(true);
  const requestRef = useRef<Promise<StaticWebAppClientPrincipal | null> | null>(null);

  async function loadClientPrincipal() {
    try {
      const nextPrincipal = await readClientPrincipal();

      if (activeRef.current) {
        setPrincipal(nextPrincipal);
        setResolved(true);
      }

      return nextPrincipal;
    } catch {
      await wait(750);

      try {
        const nextPrincipal = await readClientPrincipal();

        if (activeRef.current) {
          setPrincipal(nextPrincipal);
          setResolved(true);
        }

        return nextPrincipal;
      } catch {
        if (activeRef.current) {
          setPrincipal(null);
          setResolved(true);
        }

        return null;
      }
    }
  }

  async function refresh() {
    if (requestRef.current) {
      return requestRef.current;
    }

    const request = loadClientPrincipal().finally(() => {
      requestRef.current = null;
    });

    requestRef.current = request;
    return request;
  }

  useEffect(() => {
    void refresh();

    return () => {
      activeRef.current = false;
    };
  }, []);

  return (
    <AuthSessionContext.Provider
      value={{
        principal,
        resolved,
        signedIn: Boolean(principal),
        refresh
      }}
    >
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);

  if (!context) {
    throw new Error("useAuthSession must be used within an AuthSessionProvider.");
  }

  return context;
}
