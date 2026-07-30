#!/usr/bin/env python3
"""
ElevenEleven — Brand Library suggestion queue.
Prints the brands people have asked us to add (private brand_suggestions table).

Env:  SUPABASE_ACCESS_TOKEN  (your Supabase personal access token)
Usage: SUPABASE_ACCESS_TOKEN=sbp_xxx python3 scripts/brand_suggestions.py
"""
import os, sys, json, subprocess

REF = "bmiquikoxxukfujnpizp"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN")
if not TOKEN:
    sys.exit("✗ Set SUPABASE_ACCESS_TOKEN first (your Supabase personal access token).")


def query(sql: str):
    out = subprocess.run(
        ["curl", "-s", f"https://api.supabase.com/v1/projects/{REF}/database/query",
         "-H", f"Authorization: Bearer {TOKEN}", "-H", "Content-Type: application/json",
         "--data", json.dumps({"query": sql})],
        capture_output=True, text=True,
    ).stdout
    try:
        d = json.loads(out)
    except json.JSONDecodeError:
        sys.exit(f"✗ Unexpected response: {out[:300]}")
    if isinstance(d, dict) and d.get("message"):
        sys.exit(f"✗ API error: {d['message']}")
    return d


rows = query(
    "select brand_name, want_to_know, status, created_at "
    "from public.brand_suggestions order by created_at desc"
)

W = 66
print("\n" + "━" * W)
print("  ELEVENELEVEN — BRAND SUGGESTIONS")
print("━" * W)
print(f"  Total suggestions : {len(rows)}")
pending = sum(1 for r in rows if (r.get('status') or '') == 'pending')
print(f"  Pending review    : {pending}")
print("━" * W)

if not rows:
    print("  (none yet)")
for r in rows:
    ts = (r.get("created_at") or "")[:16].replace("T", " ")
    status = r.get("status") or "pending"
    print(f"\n  ▸ {r.get('brand_name', '?')}    [{status}]    {ts}")
    w = r.get("want_to_know")
    if w:
        print(f"      wants to know:  {w}")
print("\n" + "━" * W + "\n")
