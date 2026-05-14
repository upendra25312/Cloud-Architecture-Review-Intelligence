# ADR-001: Azure Static Web Apps for frontend hosting

**Status:** Accepted  
**Date:** 2026-05  
**Deciders:** Platform team

---

## Context

The CARI frontend is a Next.js application built with static export (`output: 'export'`). It requires a globally distributed, low-latency hosting platform with built-in SSL, custom domains, and CI/CD integration. The platform must support Azure-native authentication (Easy Auth) and integrate cleanly with the Azure Functions API backend.

## Decision

Use **Azure Static Web Apps** (SWA) as the frontend hosting platform.

## Alternatives considered

| Option | Reason not chosen |
|--------|------------------|
| Azure App Service | Higher cost and operational overhead for a static workload |
| Azure CDN + Blob Storage | No built-in auth, requires separate API proxy configuration |
| Vercel / Netlify | Adds external dependency, breaks Azure-native security boundary |

## Consequences

### Positive
- Zero-configuration global CDN distribution
- Built-in Azure Easy Auth integration (Entra ID, GitHub)
- Free SSL certificate management
- Native GitHub Actions integration
- Low cost (consumption-based, free tier available)
- Static export removes runtime server dependency

### Negative / trade-offs
- Static export constraint means no server-side rendering at runtime
- SWA routing rules must be managed in `staticwebapp.config.json`
- Image optimisation (`next/image`) requires `unoptimized: true` in static export mode

### Risks
- SWA regional availability may affect latency for non-US users (mitigated by CDN)

## Related decisions
- [ADR-004](./adr-004-github-actions-oidc-deployment.md) — deployment pipeline
