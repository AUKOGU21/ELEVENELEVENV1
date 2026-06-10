#!/usr/bin/env python3
"""
ElevenEleven conversion funnel: waitlist -> invited -> joined -> onboarded.

Cross-references the waitlist against actual beta accounts (auth.users) and
profiles to show who converted. Reads SUPABASE_ACCESS_TOKEN from env and queries
the Supabase management API (project bmiquikoxxukfujnpizp).

Usage:
    SUPABASE_ACCESS_TOKEN=sbp_xxx python3 scripts/conversions.py
"""
import os
import re
import sys
import json
import subprocess
from datetime import datetime

PROJECT_REF = "bmiquikoxxukfujnpizp"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN")
if not TOKEN:
    sys.exit("✗ Set SUPABASE_ACCESS_TOKEN first.")


def query(sql: str):
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
    data = json.loads(proc.stdout)
    if isinstance(data, dict) and data.get("message"):
        sys.exit(f"✗ API error: {data['message']}")
    return data


def fmt(ts):
    if not ts:
        return ""
    ts = re.sub(r"\.(\d+)", lambda m: "." + (m.group(1) + "000000")[:6], ts.replace(" ", "T"))
    ts = re.sub(r"\+00$", "+00:00", ts)
    try:
        return datetime.fromisoformat(ts).astimezone().strftime("%b %-d %-I:%M%p")
    except ValueError:
        return ts[:16]


rows = query(
    """
    select w.first_name, w.email, w.invited_at,
           u.id as user_id, u.created_at as joined_at,
           coalesce(p.onboarding_completed, false) as onboarded
    from public.waitlist w
    left join auth.users u on lower(u.email) = lower(w.email)
    left join public.profiles p on p.id = u.id
    order by w.created_at;
    """
)

total = len(rows)
invited = sum(1 for r in rows if r.get("invited_at"))
joined = sum(1 for r in rows if r.get("user_id"))
onboarded = sum(1 for r in rows if r.get("onboarded"))
# invited people who haven't joined yet → nudge candidates
to_nudge = [r for r in rows if r.get("invited_at") and not r.get("user_id")]

W = 74
print()
print("━" * W)
print("  ELEVENELEVEN — CONVERSION FUNNEL")
print("━" * W)
print(f"  Waitlist signups : {total}")
print(f"  Invited          : {invited}")
print(f"  Joined beta      : {joined}" + (f"   ({round(100*joined/invited)}% of invited)" if invited else ""))
print(f"  Onboarded        : {onboarded}")
print("━" * W)
print(f"  {'NAME':<14}{'EMAIL':<34}{'INVITED':<8}{'JOINED':<8}{'ONBOARDED'}")
print("─" * W)
for r in rows:
    name = (r.get("first_name") or "—").strip()
    inv = "✓" if r.get("invited_at") else "—"
    jnd = "✓" if r.get("user_id") else "—"
    onb = "✓" if r.get("onboarded") else "—"
    print(f"  {name:<14}{(r.get('email') or ''):<34}{inv:<8}{jnd:<8}{onb}")
print("━" * W)
if to_nudge:
    print(f"  NUDGE ({len(to_nudge)} invited, not joined yet):")
    for r in to_nudge:
        print(f"    {(r.get('first_name') or '').strip():<14}{r.get('email')}")
    print("━" * W)
print()
