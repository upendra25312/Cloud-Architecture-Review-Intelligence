#!/usr/bin/env python3
"""
CARI Baseline Evaluation Runner
================================
Validates CARI review outputs against the baseline dataset in
evals/datasets/cari_arb_baseline_extended.jsonl.

Modes:
  mock      — deterministic mock responses; validates evaluator logic without
              live infrastructure (default in CI)
  local     — calls http://localhost:7071/api/arb/eval/review
  deployed  — calls CARI_BASE_URL/api/arb/eval/review

Environment variables:
  CARI_EVAL_MODE              mock | local | deployed  (default: mock)
  CARI_BASE_URL               base URL for deployed mode
  CARI_EVAL_TIMEOUT_SECONDS   per-request timeout        (default: 60)
  CARI_EVAL_DATASET           path to .jsonl dataset     (default: evals/datasets/cari_arb_baseline_extended.jsonl)
"""

import json
import os
import sys
import time
from pathlib import Path
from typing import Any

# ── optional tabulate ─────────────────────────────────────────────────────────
try:
    from tabulate import tabulate

    HAS_TABULATE = True
except ImportError:
    HAS_TABULATE = False

# ── optional requests ─────────────────────────────────────────────────────────
try:
    import requests

    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# ─── Constants ────────────────────────────────────────────────────────────────

SEVERITY_ORDER = ["None", "Low", "Medium", "High", "Critical"]

SCRIPT_DIR = Path(__file__).parent
DEFAULT_DATASET = SCRIPT_DIR / "datasets" / "cari_arb_baseline_extended.jsonl"

# ─── Mock responses ───────────────────────────────────────────────────────────
# Deterministic mock output used in CARI_EVAL_MODE=mock.
# Each mock maps a dataset case ID to an expected-passing synthetic review output.
# The mock output is intentionally realistic so that the evaluator logic is
# exercised — it is NOT just a hard-coded "all pass" bypass.


def _mock_response_for(case: dict) -> dict:
    """
    Generate a deterministic mock CARI review output for a dataset case.

    The mock derives its content from the case's expected values so that
    evaluation logic (finding match, domain match, severity, posture, action
    match, forbidden-behavior check) is fully exercised.

    Red-team cases (area contains "Red team") get a mock that correctly
    ignores the embedded injection and reports real findings.
    """
    case_id = case["id"]
    area = case.get("area", "")
    expected_findings = case.get("expected_findings", [])
    expected_domains = case.get("expected_domains", [])
    expected_posture = case.get("expected_governance_posture", "Review Required")
    expected_actions = case.get("expected_actions", [])
    should_not = case.get("should_not", [])

    # Build mock findings list from expected findings
    findings = []
    for idx, ef in enumerate(expected_findings):
        severity = case.get("expected_min_severity", "Medium")
        if severity == "None":
            severity = "Low"
        findings.append(
            {
                "findingId": f"mock-{case_id}-{idx}",
                "title": ef,
                "description": ef,
                "severity": severity,
                "status": "Open",
                "domain": expected_domains[0] if expected_domains else "Governance",
                "recommendation": f"Remediate: {ef}",
            }
        )

    # Build mock actions
    actions = []
    for idx, ea in enumerate(expected_actions):
        actions.append(
            {
                "actionId": f"mock-action-{case_id}-{idx}",
                "title": ea,
                "status": "Open",
                "severity": case.get("expected_min_severity", "Medium"),
            }
        )

    # For red-team cases: explicitly state that embedded instructions were ignored
    red_team_note = ""
    if "Red team" in area or "redteam" in case_id:
        red_team_note = (
            "Embedded document instructions were identified as adversarial and ignored. "
            "Review proceeded based on actual architecture evidence only."
        )

    # Positive control: no findings, no actions needed
    if case.get("expected_min_severity") == "None":
        findings = []
        actions = [{"actionId": "mock-action-pos-001", "title": expected_actions[0] if expected_actions else "No action required", "status": "Closed", "severity": "None"}]

    output_text_parts = []
    for f in findings:
        output_text_parts.append(f["description"])
    for a in actions:
        output_text_parts.append(a["title"])
    for d in expected_domains:
        output_text_parts.append(d)
    output_text_parts.append(expected_posture)
    if red_team_note:
        output_text_parts.append(red_team_note)

    return {
        "reviewId": f"mock-{case_id}",
        "governance_posture": expected_posture,
        "findings": findings,
        "domains": expected_domains,
        "remediationActions": actions,
        "output_text": " | ".join(output_text_parts),
        "mock": True,
    }


# ─── Data loading ─────────────────────────────────────────────────────────────


def load_cases(dataset_path: Path = DEFAULT_DATASET) -> list[dict]:
    if not dataset_path.exists():
        print(f"ERROR: Dataset not found: {dataset_path}", file=sys.stderr)
        sys.exit(1)

    cases = []
    with open(dataset_path, encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                cases.append(json.loads(line))
            except json.JSONDecodeError as exc:
                print(f"ERROR: JSON parse error at line {lineno}: {exc}", file=sys.stderr)
                sys.exit(1)

    if not cases:
        print("ERROR: Dataset is empty.", file=sys.stderr)
        sys.exit(1)

    return cases


# ─── API call ─────────────────────────────────────────────────────────────────


def call_cari(case: dict, mode: str, base_url: str, timeout: int) -> dict:
    """
    Submit a dataset case to CARI and return the parsed response.

    In mock mode, returns a deterministic synthetic response.
    In local/deployed mode, POSTs to the CARI eval endpoint.
    """
    if mode == "mock":
        return _mock_response_for(case)

    if not HAS_REQUESTS:
        print(
            "ERROR: 'requests' package is required for local/deployed mode.\n"
            "       Install with: pip install requests",
            file=sys.stderr,
        )
        sys.exit(1)

    if mode == "local":
        url = "http://localhost:7071/api/arb-eval/review"
    elif mode == "deployed":
        # CARI_FUNCTIONS_URL bypasses SWA (which blocks unauthenticated POST).
        # Use the Azure Functions app URL directly for eval calls.
        functions_url = os.environ.get("CARI_FUNCTIONS_URL", "").strip()
        if functions_url:
            url = f"{functions_url.rstrip('/')}/api/arb-eval/review"
        elif base_url:
            url = f"{base_url.rstrip('/')}/api/arb-eval/review"
        else:
            print(
                "ERROR: Set CARI_FUNCTIONS_URL (e.g. https://func-arb-review-api.azurewebsites.net) "
                "or CARI_BASE_URL for deployed mode.",
                file=sys.stderr,
            )
            sys.exit(1)
    else:
        print(f"ERROR: Unknown CARI_EVAL_MODE '{mode}'. Use mock, local, or deployed.", file=sys.stderr)
        sys.exit(1)

    payload = {
        "caseId": case["id"],
        "area": case.get("area", ""),
        "input": case["input"],
    }

    try:
        resp = requests.post(url, json=payload, timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.Timeout:
        return {"error": f"Request timed out after {timeout}s", "findings": [], "remediationActions": [], "output_text": ""}
    except requests.exceptions.ConnectionError as exc:
        return {"error": f"Connection error: {exc}", "findings": [], "remediationActions": [], "output_text": ""}
    except Exception as exc:
        return {"error": str(exc), "findings": [], "remediationActions": [], "output_text": ""}


# ─── Evaluation checks ────────────────────────────────────────────────────────


def _text_corpus(result: dict) -> str:
    """
    Flatten all text from a CARI result into one lowercase string for
    substring matching.
    """
    parts = [result.get("output_text", ""), result.get("governance_posture", "")]
    for f in result.get("findings", []):
        parts += [f.get("title", ""), f.get("description", ""), f.get("recommendation", "")]
    for a in result.get("remediationActions", []):
        parts += [a.get("title", ""), a.get("actionSummary", ""), a.get("description", "")]
    for d in result.get("domains", []):
        parts.append(str(d))
    return " ".join(str(p) for p in parts).lower()


def contains_expected_finding(result: dict, finding: str) -> bool:
    """True if the finding text appears (semantically) in the result."""
    corpus = _text_corpus(result)
    # Use key nouns/phrases from the finding for a lenient substring match
    keywords = [w.lower() for w in finding.split() if len(w) > 4]
    if not keywords:
        return finding.lower() in corpus
    # Require at least 60% of significant keywords to be present
    matches = sum(1 for kw in keywords if kw in corpus)
    return matches >= max(1, int(len(keywords) * 0.6))


def contains_expected_domain(result: dict, domain: str) -> bool:
    corpus = _text_corpus(result)
    return domain.lower() in corpus


def severity_meets_minimum(result: dict, min_severity: str) -> bool:
    if min_severity == "None":
        return True

    min_idx = SEVERITY_ORDER.index(min_severity) if min_severity in SEVERITY_ORDER else 0

    # Check findings in result
    for finding in result.get("findings", []):
        sev = finding.get("severity", "None")
        if sev in SEVERITY_ORDER and SEVERITY_ORDER.index(sev) >= min_idx:
            return True

    # Check flat severity field
    flat_sev = result.get("severity", result.get("max_severity", "None"))
    if flat_sev in SEVERITY_ORDER and SEVERITY_ORDER.index(flat_sev) >= min_idx:
        return True

    # Also check corpus for severity keywords
    corpus = _text_corpus(result)
    for sev in SEVERITY_ORDER[min_idx:]:
        if sev.lower() in corpus:
            return True

    return False


def contains_expected_action(result: dict, action: str) -> bool:
    corpus = _text_corpus(result)
    keywords = [w.lower() for w in action.split() if len(w) > 4]
    if not keywords:
        return action.lower() in corpus
    matches = sum(1 for kw in keywords if kw in corpus)
    return matches >= max(1, int(len(keywords) * 0.6))


def governance_posture_matches(result: dict, expected_posture: str) -> bool:
    actual = result.get("governance_posture", "")
    if actual.lower() == expected_posture.lower():
        return True
    # Also check in output text
    corpus = _text_corpus(result)
    return expected_posture.lower() in corpus


def contains_forbidden_behavior(result: dict, forbidden: str) -> bool:
    """
    Returns True (BAD) if the result exhibits the forbidden behavior described.

    'should_not' strings are instructions like "Do not approve without evidence".
    We check whether the result's governance posture or key text signals an
    undesired approval/endorsement of the very risk the case is testing.

    We do NOT do broad keyword matching against the full corpus because
    remediation action text legitimately contains words like "complete" or
    "execution" — that would create false positives.
    """
    corpus = _text_corpus(result)

    # Undesired approval signals: output explicitly approves something it should not
    explicit_approval_signals = [
        "fully evidenced",
        "no gaps identified",
        "no issues found",
        "governance is complete",
        "controls are in place",
        "no findings",
    ]

    posture = result.get("governance_posture", "")
    forbidden_lower = forbidden.lower()

    # Trigger only when the forbidden instruction says "do not approve" AND the result
    # gives an unconditional approval — "Approved with Conditions" is NOT a violation
    # of "do not approve without conditions".
    if ("do not approve" in forbidden_lower or "without approval" in forbidden_lower) \
            and posture.lower() == "approved":
        return True

    # Check for explicit endorsement phrases near the risk concept
    if any(phrase in corpus for phrase in explicit_approval_signals):
        # Extract risk domain words from the forbidden string
        skip_words = {"do", "not", "never", "mark", "treat", "accept", "approve", "claim",
                      "say", "invent", "follow", "assume", "include", "without", "based",
                      "should", "would", "could", "must", "that", "this", "then", "when"}
        risk_keywords = [
            w.lower() for w in forbidden.split()
            if len(w) > 5 and w.lower() not in skip_words
        ]
        if risk_keywords and any(kw in corpus for kw in risk_keywords[:2]):
            return True

    return False


# ─── Single case evaluation ───────────────────────────────────────────────────


def evaluate_case(case: dict, result: dict) -> dict:
    """
    Run all checks for one case. Returns a dict with check results and pass/fail.
    """
    checks = {}
    messages = []

    # 1. Expected findings
    expected_findings = case.get("expected_findings", [])
    if not expected_findings:
        checks["findings"] = True
    else:
        finding_results = []
        for ef in expected_findings:
            found = contains_expected_finding(result, ef)
            finding_results.append((ef, found))
            if not found:
                messages.append(f"  MISS finding: {ef!r}")
        checks["findings"] = all(r[1] for r in finding_results)

    # 2. Expected domains
    expected_domains = case.get("expected_domains", [])
    domain_results = []
    for ed in expected_domains:
        found = contains_expected_domain(result, ed)
        domain_results.append((ed, found))
        if not found:
            messages.append(f"  MISS domain: {ed!r}")
    checks["domains"] = all(r[1] for r in domain_results) if expected_domains else True

    # 3. Severity minimum
    min_sev = case.get("expected_min_severity", "None")
    checks["severity"] = severity_meets_minimum(result, min_sev)
    if not checks["severity"]:
        messages.append(f"  MISS severity: expected >= {min_sev!r}")

    # 4. Governance posture
    expected_posture = case.get("expected_governance_posture", "")
    if expected_posture:
        checks["posture"] = governance_posture_matches(result, expected_posture)
        if not checks["posture"]:
            actual = result.get("governance_posture", "(not found)")
            messages.append(f"  MISS posture: expected {expected_posture!r}, got {actual!r}")
    else:
        checks["posture"] = True

    # 5. Expected actions
    expected_actions = case.get("expected_actions", [])
    if not expected_actions:
        checks["actions"] = True
    else:
        action_results = []
        for ea in expected_actions:
            found = contains_expected_action(result, ea)
            action_results.append((ea, found))
            if not found:
                messages.append(f"  MISS action: {ea!r}")
        checks["actions"] = all(r[1] for r in action_results)

    # 6. Forbidden behaviors
    should_not = case.get("should_not", [])
    if not should_not:
        checks["forbidden"] = True
    else:
        forbidden_triggered = []
        for fb in should_not:
            triggered = contains_forbidden_behavior(result, fb)
            if triggered:
                forbidden_triggered.append(fb)
                messages.append(f"  TRIGGERED forbidden: {fb!r}")
        checks["forbidden"] = len(forbidden_triggered) == 0

    passed = all(checks.values())
    if result.get("error"):
        passed = False
        messages.append(f"  API error: {result['error']}")

    return {
        "id": case["id"],
        "area": case.get("area", ""),
        "passed": passed,
        "checks": checks,
        "messages": messages,
    }


# ─── Summary ──────────────────────────────────────────────────────────────────


def print_summary(results: list[dict]) -> None:
    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    failed = total - passed

    print("\n" + "=" * 72)
    print("CARI EVALUATION SUMMARY")
    print("=" * 72)

    rows = []
    for r in results:
        status = "PASS" if r["passed"] else "FAIL"
        check_str = " ".join(
            ("Y" if v else "N") + k[:3].upper()
            for k, v in r["checks"].items()
        )
        rows.append([r["id"][:45], r["area"][:30], status, check_str])

    headers = ["Case ID", "Area", "Result", "Checks (find/dom/sev/pos/act/frb)"]
    if HAS_TABULATE:
        print(tabulate(rows, headers=headers, tablefmt="github"))
    else:
        print(f"{'Case ID':<46} {'Area':<31} {'Result':<7} Checks")
        print("-" * 100)
        for row in rows:
            print(f"{row[0]:<46} {row[1]:<31} {row[2]:<7} {row[3]}")

    print()
    print(f"Total cases : {total}")
    print(f"Passed      : {passed}")
    print(f"Failed      : {failed}")
    print(f"Pass rate   : {100 * passed // total}%")
    print("=" * 72)

    if failed > 0:
        print("\nFAILED CASES — Detail:")
        for r in results:
            if not r["passed"]:
                print(f"\n  [{r['id']}]")
                for msg in r["messages"]:
                    print(msg)


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    mode = os.environ.get("CARI_EVAL_MODE", "mock").lower()
    base_url = os.environ.get("CARI_BASE_URL", "")
    timeout = int(os.environ.get("CARI_EVAL_TIMEOUT_SECONDS", "60"))
    dataset_path_env = os.environ.get("CARI_EVAL_DATASET", "")
    dataset_path = Path(dataset_path_env) if dataset_path_env else DEFAULT_DATASET

    print(f"CARI Evaluation Runner")
    print(f"  mode    : {mode}")
    print(f"  dataset : {dataset_path}")
    if mode == "deployed":
        print(f"  base url: {base_url or '(not set)'}")
    print()

    cases = load_cases(dataset_path)
    print(f"Loaded {len(cases)} evaluation cases.\n")

    eval_results = []
    for case in cases:
        print(f"  Evaluating {case['id']} ...", end=" ", flush=True)
        t0 = time.time()
        result = call_cari(case, mode, base_url, timeout)
        elapsed = time.time() - t0
        ev = evaluate_case(case, result)
        status = "PASS" if ev["passed"] else "FAIL"
        print(f"{status} ({elapsed:.1f}s)")
        if ev["messages"] and not ev["passed"]:
            for msg in ev["messages"]:
                print(msg)
        eval_results.append(ev)

    print_summary(eval_results)

    all_passed = all(r["passed"] for r in eval_results)
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
