# RCA: Export Board Pack Button Not Downloading File

## Issue Summary

**Reported:** May 2026  
**Severity:** Medium  
**Status:** ✅ Resolved  

When clicking the "Export Board Pack" button on the Scorecard page (and other pages), no file was downloaded. Users expected an immediate file download but nothing happened.

## Root Cause Analysis

### Investigation

1. **User Action:** Click "Export Board Pack" button on Scorecard page
2. **Expected Behavior:** File downloads immediately
3. **Actual Behavior:** No visible output; export artifact created but not downloaded

### Root Cause

The `handleExport()` function in multiple page components was calling `createArbExport()` to create the export artifact on the backend, but was NOT calling `downloadArbExport()` to trigger the browser download.

**Before (broken):**
```typescript
async function handleExport() {
  const artifact = await createArbExport({...});
  setExports((prev) => [...prev, artifact]);
  // Missing: downloadArbExport(reviewId, artifact);
}
```

The export was being created successfully and added to the exports list at the bottom of the page, but users had to manually scroll down and click "Download" to get the file.

### Affected Components

| Component | Status Before Fix |
|-----------|-------------------|
| `arb-scorecard-page.tsx` | ❌ Missing download |
| `arb-overview-page.tsx` | ❌ Missing download |
| `arb-evidence-page.tsx` | ❌ Missing download |
| `arb-requirements-page.tsx` | ❌ Missing download |
| `arb-findings-page.tsx` | ✅ Already had download |

## Resolution

### Fix Applied

Added `downloadArbExport()` call after `createArbExport()` in all affected components:

**After (fixed):**
```typescript
async function handleExport() {
  const artifact = await createArbExport({...});
  setExports((prev) => [...prev, artifact]);
  // Automatically download the exported file
  await downloadArbExport(reviewId, artifact);
}
```

### Changes Made

| File | Change |
|------|--------|
| `arb-scorecard-page.tsx` | Added `downloadArbExport` call |
| `arb-overview-page.tsx` | Added `downloadArbExport` import and call |
| `arb-evidence-page.tsx` | Added `downloadArbExport` call |
| `arb-requirements-page.tsx` | Added `downloadArbExport` call |

### Deployment

- **PR:** #3
- **Merged:** May 2026
- **Deployed:** Azure Static Web Apps (automatic via GitHub Actions)

## Verification

After the fix:
1. Click "Export Board Pack" on any page
2. Export artifact is created on backend
3. File automatically downloads in browser
4. Export also appears in the Export section for re-download

## Prevention

### Recommendations

1. **Code Review:** Ensure export buttons always trigger downloads, not just create artifacts
2. **E2E Testing:** Add Playwright test to verify export button triggers file download
3. **UX Consistency:** All "Export" buttons should have consistent behavior across pages

## Timeline

| Time | Event |
|------|-------|
| T+0 | Issue reported: "Export Board Pack" not working |
| T+15m | Root cause identified: missing `downloadArbExport` call |
| T+30m | Fix implemented and tested locally |
| T+45m | PR created, reviewed, and merged |
| T+50m | Deployed to production |
| T+55m | Verified fix on live site |
