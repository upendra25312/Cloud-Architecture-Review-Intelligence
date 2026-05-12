# Finding-Action Sync Design Document

## Problem Statement

When a user updates a finding's status, owner, due date, or reviewer note in the Findings section, the linked remediation action is NOT automatically updated. Users must manually update both entities separately, leading to:
- Data inconsistency between findings and actions
- Extra manual work for reviewers
- Potential for stale action data

## Current Architecture

```
Finding                          Action
├── findingId                    ├── actionId
├── status ─────────────────────►├── status (NOT SYNCED)
├── owner ──────────────────────►├── owner (NOT SYNCED)
├── dueDate ────────────────────►├── dueDate (NOT SYNCED)
├── reviewerNote                 ├── closureNotes
├── criticalBlocker ────────────►├── reviewerVerificationRequired
└── ...                          └── sourceFindingId (link)
```

## Solution: Backend Sync on Finding Update

### Design Principles

1. **Single Source of Truth**: Finding is the primary entity; action inherits from finding
2. **Atomic Updates**: Both entities updated in single transaction
3. **Opt-in Sync**: Only sync fields that make sense (status, owner, dueDate)
4. **Backward Compatible**: Existing API contracts unchanged

### Sync Rules

| Finding Field | Action Field | Sync Behavior |
|---------------|--------------|---------------|
| `status` | `status` | Always sync (Open→Open, Closed→Closed) |
| `owner` | `owner` | Sync if action.owner is null, matches finding.owner, or was inherited from suggestedOwner |
| `dueDate` | `dueDate` | Sync if action.dueDate is null, matches finding.dueDate, or was inherited from suggestedDueDate |
| `reviewerNote` | `closureNotes` | Append to closureNotes if status=Closed |
| `criticalBlocker` | `reviewerVerificationRequired` | Sync: true→true, false→no change |

### API Changes

**PATCH /api/arb/reviews/{reviewId}/findings/{findingId}**

Request body (unchanged):
```json
{
  "status": "Closed",
  "owner": "john.doe@example.com",
  "dueDate": "2026-06-01",
  "reviewerNote": "Verified fix deployed to production",
  "criticalBlocker": false
}
```

Response body (enhanced):
```json
{
  "finding": { ... },
  "linkedAction": { ... } | null,
  "actionSynced": true | false
}
```

### Implementation

```javascript
async function updateArbFinding(principal, reviewId, findingId, input = {}) {
  // 1. Update finding (existing logic)
  const updatedFinding = await updateFindingEntity(...);
  
  // 2. Find linked action
  const actions = await getActions(reviewId, principal.userId);
  const linkedAction = actions.find(a => a.sourceFindingId === findingId);
  
  // 3. Sync action if exists
  if (linkedAction) {
    const syncedAction = syncActionFromFinding(linkedAction, updatedFinding, input);
    await updateActionEntity(syncedAction);
    return { finding: updatedFinding, linkedAction: syncedAction, actionSynced: true };
  }
  
  return { finding: updatedFinding, linkedAction: null, actionSynced: false };
}

function syncActionFromFinding(action, finding, input) {
  return {
    ...action,
    // Sync status always
    status: input.status ?? action.status,
    // Sync owner if action owner is empty or same as old finding owner
    owner: shouldSyncOwner(action, finding, input) ? input.owner : action.owner,
    // Sync dueDate if action dueDate is empty or same as old finding dueDate
    dueDate: shouldSyncDueDate(action, finding, input) ? input.dueDate : action.dueDate,
    // Sync criticalBlocker → reviewerVerificationRequired
    reviewerVerificationRequired: input.criticalBlocker === true 
      ? true 
      : action.reviewerVerificationRequired,
    // Append reviewerNote to closureNotes if closing
    closureNotes: input.status === 'Closed' && input.reviewerNote
      ? appendNote(action.closureNotes, input.reviewerNote)
      : action.closureNotes
  };
}
```

## PDCA Implementation Plan

### PLAN
- [x] Analyze current architecture
- [x] Design sync logic
- [x] Define sync rules
- [x] Document API changes

### DO
- [x] Update `updateArbFinding()` in `arb-review-store.js`
- [x] Add sync helper functions
- [x] Update frontend to handle new response shape
- [x] Add unit tests for sync logic

### CHECK
- [x] Test finding update syncs to action
- [x] Test action-only update doesn't affect finding
- [x] Test edge cases (no linked action, null values)
- [x] Verify backward compatibility

### ACT
- [ ] Deploy to staging
- [ ] Monitor for errors
- [ ] Deploy to production
- [ ] Update documentation
