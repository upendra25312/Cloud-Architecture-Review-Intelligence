// When NEXT_PUBLIC_API_URL is set (production), calls go directly to the Function App.
// When empty (local dev / SWA proxy), relative paths are used unchanged.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

let _cachedPrincipal: object | null | undefined = undefined;

async function fetchClientPrincipal(forceRefresh = false): Promise<object | null> {
  if (!forceRefresh && _cachedPrincipal !== undefined) return _cachedPrincipal;
  try {
    const res = await fetch("/.auth/me", { cache: "no-store" });
    if (!res.ok) return (_cachedPrincipal = null);
    const data = (await res.json()) as { clientPrincipal?: object | null };
    return (_cachedPrincipal = data?.clientPrincipal ?? null);
  } catch {
    return (_cachedPrincipal = null);
  }
}

// Drop-in replacement for fetch() that:
//  1. Prefixes the path with the Function App base URL (when NEXT_PUBLIC_API_URL is set)
//  2. Injects x-ms-client-principal so the Function App can identify the caller
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const isWrite = Boolean(init?.method && !["GET", "HEAD", "OPTIONS"].includes(init.method.toUpperCase()));
  const principal = await fetchClientPrincipal(isWrite);
  const authHeader: Record<string, string> = principal
    ? { "x-ms-client-principal": btoa(JSON.stringify(principal)) }
    : {};
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeader, ...((init?.headers as Record<string, string>) ?? {}) }
  });
}
