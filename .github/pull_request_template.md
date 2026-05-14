## Summary

<!-- One paragraph: what changed and why. -->

## Problem statement

<!-- What gap, issue, or opportunity does this PR address? Link to issue if applicable. -->

## Changes made

<!-- Summarize the implementation or documentation changes. Keep it concise. -->

## Production impact classification

<!-- Select one — see standards/release/production-change-control.md -->

- [ ] **Safe internal refactor** — no runtime, routing, config, or API changes
- [ ] **Production-sensitive change** — affects runtime behavior, deployment, or user experience
- [ ] **Blocked change** — requires safeguards before proceeding (do not merge)

### If production-sensitive, complete the following:

| Question | Answer |
|----------|--------|
| What is changing in production behavior? | |
| Which routes or APIs are affected? | |
| Can performance change? | |
| Rollback approach | |
| Validation / smoke test plan | |

## Validation

<!-- List tests run, manual validation performed, screenshots, or evidence. -->

- [ ] Type check passes (`npm run typecheck`)
- [ ] Unit tests pass (`npm test`)
- [ ] E2E smoke test passes (homepage, `/arb`, primary review path)
- [ ] No regressions observed in core workflow

## Checklist

- [ ] Change is classified above
- [ ] PR scope is focused (one logical change)
- [ ] Documentation updated if behavior changed
- [ ] No hardcoded secrets or credentials introduced
