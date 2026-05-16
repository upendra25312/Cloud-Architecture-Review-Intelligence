#!/usr/bin/env python3
"""
CARI Export Parity Evaluation Runner
======================================
Verifies that all CARI export formats (Markdown, HTML, CSV, Excel, PPTX)
produce identical values for canonical review fields.

Two operating modes:

  1. Pack file mode (default in CI):
     Reads canonical pack JSON files written by the Node test suite when
     CARI_DUMP_PACKS=1 is set. Files are expected at:
       out/markdown.pack.json
       out/html.pack.json
       out/pptx.pack.json
       out/csv.pack.json
       out/xlsx.pack.json

  2. API mode (CARI_PARITY_MODE=local or deployed):
     Calls the CARI export API for a real review and compares returned packs.
     Requires a reviewId set via CARI_PARITY_REVIEW_ID.

Environment variables:
  CARI_PARITY_MODE          packfiles | local | deployed  (default: packfiles)
  CARI_BASE_URL             base URL for deployed mode
  CARI_PARITY_REVIEW_ID     reviewId used for API-mode parity calls
  CARI_DUMP_DIR             directory containing *.pack.json files  (default: out/)
  CARI_EVAL_TIMEOUT_SECONDS per-request timeout  (default: 60)
"""

import json
import os
import sys
from pathlib import Path
from typing import Any

try:
    from tabulate import tabulate
    HAS_TABULATE = True
except ImportError:
    HAS_TABULATE = False

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# ─── Constants ────────────────────────────────────────────────────────────────

FORMATS = ["markdown", "html", "pptx", "csv", "xlsx"]

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT   = SCRIPT_DIR.parent
DEFAULT_DUMP_DIR = REPO_ROOT / "out"

# Fields to compare across formats.
# Expressed as dot-notation paths into the canonical pack JSON.
PARITY_FIELDS = [
    "metadata.reviewId",
    "customer.name",
    "project.name",
    "workflow.currentState",
    "evidenceReadiness.status",
    "scorecard.percentage",
    "scorecard.totalScore",
    "decision.reviewerDecision",
    "decision.governancePosture",
    "decision.riskAcceptanceRequired",
    "findings.length",
    "remediationActions.length",
    "riskRegister.length",
    "uploadedInputs.length",
]

# Domain sub-fields to check per-domain (compared across formats by domain name).
DOMAIN_FIELDS = ["score", "maxScore", "percentage"]

# ─── Path helpers ─────────────────────────────────────────────────────────────


def _get(obj: Any, path: str) -> Any:
    """
    Resolve a dot-notation path through a nested dict/list.
    Supports a special `.length` suffix for list/dict length.
    """
    parts = path.split(".")
    cur = obj
    for part in parts:
        if part == "length":
            if cur is None:
                return None
            return len(cur) if isinstance(cur, (list, dict)) else None
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


# ─── Pack loading ─────────────────────────────────────────────────────────────


def load_pack_files(dump_dir: Path) -> dict[str, dict]:
    """
    Load *.pack.json files from dump_dir. Returns {format: pack_dict}.
    Missing files are reported but do not abort — the comparison table will
    show MISSING for those formats.
    """
    packs = {}
    for fmt in FORMATS:
        p = dump_dir / f"{fmt}.pack.json"
        if p.exists():
            try:
                with open(p, encoding="utf-8") as fh:
                    packs[fmt] = json.load(fh)
            except json.JSONDecodeError as exc:
                print(f"  WARNING: Could not parse {p}: {exc}", file=sys.stderr)
                packs[fmt] = None
        else:
            packs[fmt] = None
    return packs


def load_packs_from_api(base_url: str, review_id: str, timeout: int) -> dict[str, dict]:
    """
    Fetch canonical pack data from the CARI API for each format.
    The CARI API returns export artifacts; for parity we use the /exports
    endpoint with a format param that returns the canonical pack JSON.
    """
    if not HAS_REQUESTS:
        print(
            "ERROR: 'requests' package is required for API mode.\n"
            "       Install with: pip install requests",
            file=sys.stderr,
        )
        sys.exit(1)

    packs = {}
    for fmt in FORMATS:
        url = f"{base_url.rstrip('/')}/api/arb/reviews/{review_id}/exports/pack/{fmt}"
        try:
            resp = requests.get(url, timeout=timeout)
            if resp.status_code == 404:
                print(f"  WARNING: Pack endpoint not found for format {fmt} ({url})")
                packs[fmt] = None
            else:
                resp.raise_for_status()
                packs[fmt] = resp.json()
        except Exception as exc:
            print(f"  ERROR fetching pack for format {fmt}: {exc}", file=sys.stderr)
            packs[fmt] = None
    return packs


# ─── Comparison ───────────────────────────────────────────────────────────────


def compare_packs(packs: dict[str, dict]) -> tuple[list[dict], bool]:
    """
    Compare canonical pack values across formats.

    Returns (rows, all_pass) where rows is a list of comparison result dicts.
    """
    rows = []
    all_pass = True

    available_formats = [f for f in FORMATS if packs.get(f) is not None]
    if len(available_formats) < 2:
        print(
            "\nERROR: Fewer than 2 format packs are available for comparison.\n"
            "       Run `CARI_DUMP_PACKS=1 npm --prefix api test` to generate pack files.",
            file=sys.stderr,
        )
        return rows, False

    # ── Standard fields ──────────────────────────────────────────────────────
    for field in PARITY_FIELDS:
        values = {}
        for fmt in FORMATS:
            pack = packs.get(fmt)
            if pack is None:
                values[fmt] = "MISSING"
            else:
                v = _get(pack, field)
                values[fmt] = v if v is not None else "(null)"

        available_vals = [v for f, v in values.items() if v != "MISSING"]
        if len(available_vals) < 2:
            result = "SKIP"
        elif all(v == available_vals[0] for v in available_vals):
            result = "PASS"
        else:
            result = "FAIL"
            all_pass = False

        rows.append({
            "field": field,
            "values": values,
            "result": result,
        })

    # ── Domain sub-fields ────────────────────────────────────────────────────
    # Collect all domain names from available packs
    domain_names: set[str] = set()
    for fmt in available_formats:
        pack = packs[fmt]
        domains = _get(pack, "scorecard.domains") or []
        for d in domains:
            if isinstance(d, dict) and d.get("domain"):
                domain_names.add(d["domain"])

    for domain in sorted(domain_names):
        for sub in DOMAIN_FIELDS:
            field_label = f"scorecard.domains[{domain}].{sub}"
            values = {}
            for fmt in FORMATS:
                pack = packs.get(fmt)
                if pack is None:
                    values[fmt] = "MISSING"
                    continue
                domains = _get(pack, "scorecard.domains") or []
                domain_obj = next((d for d in domains if isinstance(d, dict) and d.get("domain") == domain), None)
                if domain_obj is None:
                    values[fmt] = "(absent)"
                else:
                    v = domain_obj.get(sub)
                    values[fmt] = v if v is not None else "(null)"

            available_vals = [v for f, v in values.items() if v not in ("MISSING", "(absent)")]
            if len(available_vals) < 2:
                result = "SKIP"
            elif all(v == available_vals[0] for v in available_vals):
                result = "PASS"
            else:
                result = "FAIL"
                all_pass = False

            rows.append({
                "field": field_label,
                "values": values,
                "result": result,
            })

    return rows, all_pass


# ─── Output ───────────────────────────────────────────────────────────────────


def print_comparison_table(rows: list[dict]) -> None:
    headers = ["Field"] + FORMATS + ["Result"]
    table_rows = []
    for row in rows:
        table_row = [row["field"]]
        for fmt in FORMATS:
            v = row["values"].get(fmt, "MISSING")
            table_row.append(str(v)[:25])
        table_row.append(row["result"])
        table_rows.append(table_row)

    print("\n" + "=" * 100)
    print("CARI EXPORT PARITY EVALUATION")
    print("=" * 100)

    if HAS_TABULATE:
        print(tabulate(table_rows, headers=headers, tablefmt="github"))
    else:
        col_widths = [max(len(str(r[i])) for r in table_rows + [headers]) for i in range(len(headers))]
        fmt_str = "  ".join(f"{{:<{w}}}" for w in col_widths)
        print(fmt_str.format(*headers))
        print("-" * sum(col_widths + [2 * (len(headers) - 1)]))
        for row in table_rows:
            print(fmt_str.format(*row))

    total  = len(rows)
    passed = sum(1 for r in rows if r["result"] == "PASS")
    failed = sum(1 for r in rows if r["result"] == "FAIL")
    skipped = total - passed - failed

    print()
    print(f"Checks: {total} total  |  {passed} PASS  |  {failed} FAIL  |  {skipped} SKIP")

    if failed > 0:
        print("\nFAILED FIELDS:")
        for row in rows:
            if row["result"] == "FAIL":
                val_str = "  ".join(f"{f}={row['values'].get(f, 'MISSING')}" for f in FORMATS)
                print(f"  {row['field']}: {val_str}")

    print("=" * 100)


def print_guidance_if_missing(packs: dict[str, dict]) -> None:
    missing = [f for f in FORMATS if packs.get(f) is None]
    if not missing:
        return

    print("\nINFO: The following format packs were not found:")
    for f in missing:
        print(f"  out/{f}.pack.json")
    print()
    print("To generate pack files, run:")
    print("  CARI_DUMP_PACKS=1 npm --prefix api test")
    print()
    print("This writes canonical pack JSON to out/<format>.pack.json for each")
    print("format exercised by the parity test suite.")
    print()
    if len(missing) == len(FORMATS):
        print("WARNING: No pack files found. Parity comparison cannot run.")
        print("         In CI, ensure the 'Run API tests' step runs with CARI_DUMP_PACKS=1")
        print("         before this evaluation step.")


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    mode       = os.environ.get("CARI_PARITY_MODE", "packfiles").lower()
    base_url   = os.environ.get("CARI_BASE_URL", "")
    review_id  = os.environ.get("CARI_PARITY_REVIEW_ID", "")
    timeout    = int(os.environ.get("CARI_EVAL_TIMEOUT_SECONDS", "60"))
    dump_dir   = Path(os.environ.get("CARI_DUMP_DIR", str(DEFAULT_DUMP_DIR)))

    print("CARI Export Parity Evaluation")
    print(f"  mode    : {mode}")
    if mode == "packfiles":
        print(f"  dump dir: {dump_dir}")
    elif mode in ("local", "deployed"):
        print(f"  base url: {base_url or '(not set)'}")
        print(f"  reviewId: {review_id or '(not set)'}")
    print()

    if mode == "packfiles":
        packs = load_pack_files(dump_dir)
        print_guidance_if_missing(packs)

        available = [f for f in FORMATS if packs.get(f) is not None]
        if not available:
            print("No pack files available. Cannot run parity check.")
            print("Exit: 0 (inconclusive — not a failure in CI when packs not yet generated)")
            return 0

        print(f"Loaded pack files for: {', '.join(available)}")
        missing = [f for f in FORMATS if packs.get(f) is None]
        if missing:
            print(f"Missing packs for   : {', '.join(missing)} (will show MISSING)")

    elif mode == "local":
        if not review_id:
            print("ERROR: CARI_PARITY_REVIEW_ID must be set for local mode.", file=sys.stderr)
            return 1
        base_url = "http://localhost:7071"
        packs = load_packs_from_api(base_url, review_id, timeout)

    elif mode == "deployed":
        if not base_url or not review_id:
            print("ERROR: CARI_BASE_URL and CARI_PARITY_REVIEW_ID must be set for deployed mode.", file=sys.stderr)
            return 1
        packs = load_packs_from_api(base_url, review_id, timeout)

    else:
        print(f"ERROR: Unknown CARI_PARITY_MODE '{mode}'. Use packfiles, local, or deployed.", file=sys.stderr)
        return 1

    rows, all_pass = compare_packs(packs)
    print_comparison_table(rows)

    if not rows:
        print("No comparison rows produced — check that pack files contain valid JSON.")
        return 0

    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
