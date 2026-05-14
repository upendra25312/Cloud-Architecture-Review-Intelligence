# Root Cause Analysis: "Unable to load ARB review (401)" Error

**Date**: May 12, 2026  
**Severity**: Medium  
**Status**: Investigating  
**Affected URL**: https://red-coast-0b2d8700f.7.azurestaticapps.net/arb

---

## Executive Summary

Users are seeing "Unable to load ARB review (401)" error when accessing the ARB review page. This is **expected behavior** for unauthenticated users, but the error message is confusing. The root cause is that the frontend shows a generic error instead of redirecting to the login page when the API returns 401.

---

## Investigation Timeline

| Time | Action | Finding |
|------|--------|---------|
| 03:48 | Health check | API healthy (200 OK) |
| 03:49 | Function list | All 55 functions registered |
| 03:50 | Easy Auth check | Enabled with Azure AD provider |
| 03:51 | App settings | AZURE_CLIENT_ID and AZURE_CLIENT_SECRET configured |
| 03:52 | Azure AD app | Valid, secret expires 2028 |
| 03:53 | Auth endpoint | /.auth/me returns null clientPrincipal (expected for unauthenticated) |
| 03:53 | API endpoint | /api/arb/reviews returns 401 (expected for unauthenticated) |
| 03:54 | Login flow | Working correctly (302 redirect to Azure AD) |

---

## Root Cause Analysis

### Primary Root Cause

The 401 error is **expected behavior** when:
1. User is not authenticated (no session)
2. User's session has expired
3. User's authentication cookie was cleared

The `staticwebapp.config.json` correctly requires authentication for `/api/arb/*` routes:

```json
{
  "route": "/api/arb/*",
  "allowedRoles": ["authenticated"]
}
```

### Secondary Issue (UX Problem)

The frontend shows a confusing error message instead of:
1. Redirecting to the login page, OR
2. Showing a clear "Please sign in" message

**Current behavior** (in `frontend/src/arb/api.ts`):
```typescript
const payload = await readJsonResponse<{ review: ArbReviewSummary }>(
  response,
  `Unable to load ARB review (${response.status}).`  // Generic error
);
```

**Expected behavior**:
- For 401 errors: Show "Please sign in to access your reviews" with a login button
- For other errors: Show the current error message

---

## Impact Assessment

| Aspect | Impact |
|--------|--------|
| Users affected | All unauthenticated users |
| Functionality | ARB review page shows error instead of login prompt |
| Data loss | None |
| Security | None (authentication working correctly) |

---

## Resolution Plan (PDCA Method)

### PLAN

1. **Immediate**: Verify the authentication flow is working
2. **Short-term**: Improve frontend error handling for 401 responses
3. **Long-term**: Add session monitoring and auto-refresh

### DO

#### Fix 1: Improve 401 Error Handling in Frontend

Update `frontend/src/arb/api.ts` to handle 401 specifically:

```typescript
async function readJsonResponse<T>(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    // Handle 401 specifically - redirect to login
    if (response.status === 401) {
      throw new Error("Please sign in to access your reviews. Your session may have expired.");
    }
    // ... rest of error handling
  }
  return (await response.json()) as T;
}
```

#### Fix 2: Add Login Redirect in Review Library

Update `frontend/src/components/arb/review-library.tsx` to catch 401 errors and show login UI:

```typescript
async function load() {
  try {
    const payload = await listArbReviews();
    // ...
  } catch (loadError) {
    if (loadError instanceof Error && loadError.message.includes("401")) {
      // Session expired - show login UI
      setError(null);
      return;
    }
    setError(loadError instanceof Error ? loadError.message : "Unable to load reviews.");
  }
}
```

### CHECK

1. Test unauthenticated access → Should show login page
2. Test expired session → Should show "session expired" message
3. Test authenticated access → Should load reviews normally
4. Test API errors (500) → Should show error message

### ACT

1. Deploy frontend changes
2. Monitor error rates in Application Insights
3. Document the expected authentication flow

---

## Verification Steps

### Manual Testing

1. Open incognito browser
2. Navigate to https://red-coast-0b2d8700f.7.azurestaticapps.net/arb
3. **Expected**: See login page with "Sign in to start review" button
4. Click sign in → Complete Azure AD login
5. **Expected**: See review workspace

### Automated Monitoring

```kusto
// Application Insights query for 401 errors
requests
| where resultCode == "401"
| where url contains "/api/arb/"
| summarize count() by bin(timestamp, 1h), url
| order by timestamp desc
```

---

## Preventive Measures

1. **Session monitoring**: Add client-side session expiry detection
2. **Graceful degradation**: Show login UI instead of error for auth failures
3. **User feedback**: Clear messaging about authentication requirements
4. **Documentation**: Update user guide with authentication flow

---

## Appendix: Configuration Verification

### Static Web App Auth Settings ✅
- Azure AD provider: Configured
- Client ID: f9f6dd08-81f4-4a80-a631-6c3de8ae1343
- Client Secret: Valid (expires 2028-05-09)
- Tenant ID: 5f51e0e9-4a52-494f-8068-27a3527967de

### Function App ✅
- Health: Healthy
- Functions: 55 registered
- Easy Auth: Enabled (AllowAnonymous for unauthenticated)

### Linked Backend ✅
- Backend: func-arb-review-api
- Region: eastus2
- Status: Succeeded
