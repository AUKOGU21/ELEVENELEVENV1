#!/usr/bin/env python3
"""
ElevenEleven waitlist tracker.

Prints a summary of waitlist signups: totals, breakdown by source (UTM), and
the most recent signups. Reads the Supabase personal access token from the
SUPABASE_ACCESS_TOKEN env var (never hard-coded), and queries via the Supabase
management API (the waitlist table is read-protected, so the anon key can't see
rows — this is the authorized way to read them).

Usage:
    SUPABASE_ACCESS_TOKEN=sbp_xxx python3 scripts/waitlist.py [N]
    # N = how many recent signups to list (default 25)
"""
import os
import re
import sys
import json
import subprocess
from datetime import datetime, timezone, timedelta

PROJECT_REF = "bmiquikoxxukfujnpizp"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN")
LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 25

if not TOKEN:
    sys.exit("✗ Set SUPABASE_ACCESS_TOKEN first (your Supabase personal access token).")


def query(sql: str):
    """Run SQL via the management API (uses curl to avoid UA blocking)."""
    proc = subprocess.run(
        [
            "curl", "-s",
            f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
            "-H", f"Authorization: Bearer {TOKEN}",
            "-H", "Content-Type: application/json",
            "--data", json.dumps({"query": sql}),
        ],
        capture_output=True, text=True,
    )
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        sys.exit(f"✗ Unexpected response: {proc.stdout[:300]}")
    if isinstance(data, dict) and data.get("message"):
        sys.exit(f"✗ API error: {data['message']}")
    return data


def parse_ts(s: str) -> datetime:
    # e.g. "2026-06-09 15:34:36.89408+00" — normalize TZ + fractional seconds (some
    # Python versions reject non-6-digit microseconds), then parse.
    s = s.strip().replace(" ", "T")
    s = re.sub(r"\+00$", "+00:00", s)
    s = re.sub(r"\.(\d+)", lambda m: "." + (m.group(1) + "000000")[:6], s)
    return datetime.fromisoformat(s)


rows = query(
    "select first_name, last_name, email, source, utm_source, utm_campaign, created_at "
    "from public.waitlist order by created_at desc;"
)

now = datetime.now(timezone.utc)
day_ago = now - timedelta(days=1)
week_ago = now - timedelta(days=7)

total = len(rows)
today = sum(1 for r in rows if r.get("created_at") and parse_ts(r["created_at"]) >= day_ago)
week = sum(1 for r in rows if r.get("created_at") and parse_ts(r["created_at"]) >= week_ago)

# Breakdown by source (utm_source, falling back to `source`)
by_source: dict[str, int] = {}
for r in rows:
    key = r.get("utm_source") or r.get("source") or "direct / unknown"
    by_source[key] = by_source.get(key, 0) + 1

W = 60
print()
print("━" * W)
print("  ELEVENELEVEN — WAITLIST")
print("━" * W)
print(f"  Total signups : {total}")
print(f"  Last 24 hours : {today}")
print(f"  Last 7 days   : {week}")
print("━" * W)
print("  BY SOURCE")
for src, n in sorted(by_source.items(), key=lambda kv: kv[1], reverse=True):
    bar = "█" * min(n, 30)
    print(f"    {src:<22} {n:>4}  {bar}")
print("━" * W)
print(f"  LATEST {min(LIMIT, total)} SIGNUPS")
print("━" * W)
for r in rows[:LIMIT]:
    name = f"{(r.get('first_name') or '').strip()} {(r.get('last_name') or '').strip()}".strip() or "—"
    when = ""
    if r.get("created_at"):
        ts = parse_ts(r["created_at"]).astimezone()
        when = ts.strftime("%b %-d, %-I:%M %p")
    src = r.get("utm_source") or r.get("source") or ""
    print(f"  {name:<22} {(r.get('email') or ''):<32} {src:<12} {when}")
print("━" * W)
print()
