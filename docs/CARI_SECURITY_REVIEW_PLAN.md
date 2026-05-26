# CARI Security Review Plan

_Mode B output — generated 2026-05-26. Covers current security posture and remaining action items._

---

## Security Posture Summary

CARI uses Azure-native security controls. Managed Identity is the auth model for all service-to-service calls. No client secrets or API keys are stored in code. Upload security, ARB output validation, prompt injection evals, and RBAC isolation are all in place as of this session.

---

## Controls in Place

| Control | Location | Status |
|---|---|---|
| Magic bytes sniffing (content-type spoofing prevention) | `api/src/shared/arbUploadFiles.js` | ✅ C1 |
| File extension allowlist | `api/src/shared/arbUploadFiles.js` | ✅ Existing |
| MIME type validation | `api/src/shared/arbUploadFiles.js` | ✅ Existing |
| ARB JSON schema validation before storage | `api/src/shared/runAgent.js` | ✅ C2 |
| EvidenceId cross-validation | `api/src/shared/runAgent.js` | ✅ C3 |
| Prompt injection eval cases (9 cases) | `evals/datasets/` | ✅ C9 |
| API-level RBAC cross-user isolation tests | `api/src/functions/` | ✅ C10 |
| Managed Identity for all Azure service auth | `infrastructure/terraform/` | ✅ Existing |
| Azure Key Vault for secrets | `rg-arb-review-prod` | ✅ Existing |
| CorrelationId for audit trail | `api/src/shared/review-telemetry.js` | ✅ C5 |
| MCP query metadata persisted (queryHash, not raw query) | `api/src/shared/fetchMicrosoftLearnGrounding.js` | ✅ C4 |
| Static Web Apps built-in AAD auth | `staticwebapp.config.json` | ✅ Existing |
| No raw customer content in telemetry | `api/src/shared/review-telemetry.js` | ✅ Enforced |

---

## Remaining Security Gaps

### P1 — Malware Scanning Design

**Gap:** No malware scanning on uploaded files beyond magic bytes detection.  
**Risk:** Malicious documents could contain macro exploits or embedded payloads that bypass extension + MIME + magic bytes checks.  
**Recommendation:**
- Design: Use Defender for Storage event-based scanning (no code change required — Azure-native)
- Or: Integrate ClamAV as a sidecar in the office-renderer container
- Stub hook point in `arbUploadFiles.js` as `await scanForMalware(blobUrl)` for future integration
- Document in runbook before next customer demo with live uploads

**Files:** `api/src/shared/arbUploadFiles.js`, new runbook `docs/runbooks/malware-scan-design.md`

---

### P1 — MCP Query Sanitization

**Gap:** Microsoft Learn MCP queries may contain customer project names or sensitive architecture terms if passed verbatim.  
**Risk:** Customer-sensitive terms could appear in persisted query text in Azure Table Storage.  
**Recommendation:**
- Sanitize query text: strip project names, customer names, and IP ranges before persistence
- Persist `queryHash` (SHA-256) as the audit key; store only sanitized query text
- Existing `fetchMicrosoftLearnGrounding.js` stores full query — add sanitization step

**Files:** `api/src/shared/fetchMicrosoftLearnGrounding.js`

---

### P2 — Unsafe Export Download Links

**Gap:** PPTX and XLSX export download links may use long-lived or unscoped SAS tokens.  
**Risk:** If a SAS token is leaked (e.g., in browser history or logs), it could expose board-pack content outside the review session.  
**Recommendation:**
- Use short-lived SAS tokens (≤15 min) for all export download links
- Scope tokens to the specific blob and download operation only
- Verify in `api/src/functions/arbExport.js`

**Files:** `api/src/functions/arbExport.js`

---

### P2 — Public Network Access for Sensitive Services

**Gap:** Some Azure services (AI Search, Document Intelligence) may allow public network access.  
**Risk:** Unrestricted public access increases attack surface.  
**Recommendation:**
- Review and restrict public network access for: Azure AI Search, Document Intelligence, Azure Storage, Azure Functions
- Enforce private endpoints where feasible (note: Terraform frozen — changes via CI/CD only)
- Document current network posture in `docs/current-state/`

**Files:** `infrastructure/terraform/`, `docs/current-state/performance-baseline.md`

---

### P3 — Over-Permissive Managed Identity Roles

**Gap:** Managed Identity roles may be broader than required for least-privilege.  
**Risk:** Compromised identity could access more resources than needed.  
**Recommendation:**
- Audit role assignments for `func-arb-review-api-flex` Managed Identity
- Expected minimum roles: `Storage Blob Data Contributor` (blobs only), `Cognitive Services User` (AI), `Search Index Data Contributor` (AI Search)
- Document actual roles vs minimum required

**Files:** `infrastructure/terraform/modules/`, `docs/guides/development/SECURITY-APPROVAL-PREREQUISITES.md`

---

## Security Testing Requirements

| Test type | Current state | Gap |
|---|---|---|
| Upload magic bytes unit tests | ✅ 11 tests pass | None |
| Prompt injection eval cases | ✅ 9 cases in dataset | Extend to 15+ |
| RBAC cross-user isolation tests | ✅ 10 tests pass | Add expired session test |
| SAS token lifetime test | ❌ Not tested | Add check in `arbExport.test.js` |
| Malware scan integration test | ❌ Not applicable (design pending) | — |

---

## Privacy and Data Classification Rules

| Rule | Enforcement |
|---|---|
| No full customer document content in logs | `review-telemetry.js` — status/ID/count only |
| No secrets in code | `git grep` clean; Key Vault used |
| No customer data in eval dataset | Eval cases use synthetic architecture scenarios |
| No customer names in MCP query persistence | Gap — see P1 sanitization above |
| Short-lived SAS tokens for exports | Gap — see P2 above |
| Board-pack exports project-scoped | Enforced by RBAC at API level (C10) |

---

## Security Review Cadence

| Activity | Frequency | Owner |
|---|---|---|
| `npm audit` on `api/` and `frontend/` | Every sprint | Eng |
| Upload security test suite | Every `api/` change | CI |
| Prompt injection eval run | Monthly | AI |
| Managed Identity role audit | Quarterly | Platform |
| Network posture review | Quarterly | Platform |
| SAS token lifetime review | Before each major release | Eng |

---

_This plan is not a compliance sign-off. It is a living engineering security backlog. Update after each sprint._
