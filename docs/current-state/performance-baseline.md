# Current-State Performance and Functional Baseline

## Purpose

This document records the current-state functional and performance baseline for the live production experience before broader restructuring or delivery changes proceed.

Primary production site:

`https://red-coast-0b2d8700f.7.azurestaticapps.net/`

This baseline exists so future work can be compared against a documented reference rather than assumptions.

---

## Baseline date

Record the date when this baseline is first captured and update it only when the team intentionally resets the baseline.

- Initial baseline date: `2026-05-14`

---

## Baseline routes

The following routes represent the minimum live-site surfaces that should be checked before and after production-sensitive changes.

### Route 1: Homepage
- Path: `/`
- Purpose: primary landing and shell validation
- Expected baseline:
  - page loads successfully
  - core layout renders correctly
  - major static assets load
  - no obvious blocking runtime error appears

### Route 2: ARB experience entry
- Path: `/arb`
- Purpose: validate the main application route is available
- Expected baseline:
  - route loads successfully
  - page shell renders
  - primary navigation/UI is visible
  - no immediate broken state is shown by default

### Route 3: Representative review flow
- Path: use one representative live review-related route or flow
- Purpose: validate a meaningful business workflow, not just page shell loading
- Expected baseline:
  - route or flow is reachable
  - expected major UI sections render
  - no obvious blocking error prevents core usage
  - data-backed experience behaves plausibly for the selected example

> Note: if a stable representative review URL is used for ongoing comparisons, record it here explicitly.

---

## Functional smoke checklist

Use this checklist for current-state comparisons before and after production-affecting changes.

### Frontend shell
- [ ] Homepage loads
- [ ] `/arb` loads
- [ ] Representative review route/flow loads
- [ ] No obvious blocking JavaScript/runtime failure
- [ ] Navigation appears usable
- [ ] Core styling/layout appears intact
- [ ] Major static assets load successfully

### API-connected behavior
- [ ] API-backed screens do not obviously fail in the checked flow
- [ ] No obvious auth-related break appears in the checked flow
- [ ] No obvious data-loading dead end appears in the checked flow

### User experience
- [ ] No obvious broken-page state appears on primary routes
- [ ] No obvious severe regression in responsiveness is observed
- [ ] No obvious content overlap/layout collapse is visible on checked routes

---

## Observable performance notes

This repository does not yet treat this document as a formal synthetic monitoring system. For now, baseline performance should be captured using practical, repeatable observations.

Record observations such as:

- whether the page feels materially slower than expected
- whether the first visible content appears promptly
- whether major layout shifts are obvious
- whether the application becomes interactive in a reasonable time
- whether route transitions appear unusually delayed
- whether static assets appear delayed or broken

### Baseline observation areas
Capture notes for at least:

#### Homepage
- initial load feel
- visible rendering stability
- major asset loading behavior

#### `/arb`
- route load feel
- shell render timing
- obvious interactivity readiness

#### Representative review flow
- initial render feel
- data-backed content loading feel
- obvious delays, stalls, or blocking states

---

## Suggested manual capture format

For each checked route, record concise notes using this structure:

- Route:
- Date/time checked:
- Checked by:
- Functional result:
- Performance observation:
- Notable issues:
- Comparison to prior baseline:

Example:

- Route: `/arb`
- Date/time checked: `2026-05-14 10:00 UTC`
- Checked by: `owner/reviewer`
- Functional result: `Pass`
- Performance observation: `Initial shell appeared promptly; no blocking runtime issue observed`
- Notable issues: `None obvious`
- Comparison to prior baseline: `Initial baseline`

---

## Comparison rule for future changes

Any production-sensitive change should be checked against this baseline for:

- route availability
- visible UX regressions
- obvious performance degradation
- functional smoke behavior

If a change makes the experience materially worse, it should be treated as a release concern even if the deployment technically succeeds.

---

## Known limitations

This is a practical current-state baseline, not a complete observability solution.

Current limitations may include:
- manual observation bias
- limited route coverage
- no automated threshold enforcement yet
- dependence on available live examples for review flows

These limitations do not reduce the need to compare future changes against a documented baseline.

---

## Next maturity step

Future improvements may include:
- preview environment comparison
- automated smoke checks
- bundle/performance guardrails
- route-specific validation scripts
- explicit release quality gates

Until then, this document is the minimum current-state reference for safe modernization.
