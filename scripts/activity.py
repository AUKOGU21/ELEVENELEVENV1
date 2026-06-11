#!/usr/bin/env python3
"""
ElevenEleven in-app activity report (from Supabase): accounts, onboarding,
decisions posted, weigh-ins, outcomes, votes, saves, and recent activity.
For clicks/pageviews/funnels, see PostHog (us.posthog.com).

Usage: SUPABASE_ACCESS_TOKEN=sbp_xxx python3 scripts/activity.py
"""
import os, re, sys, json, subprocess
from datetime import datetime, timezone, timedelta

REF = "bmiquikoxxukfujnpizp"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN")
if not TOKEN:
    sys.exit("✗ Set SUPABASE_ACCESS_TOKEN.")


def q(sql):
    out = subprocess.run([
        "curl", "-s", f"https://api.supabase.com/v1/projects/{REF}/database/query",
        "-H", f"Authorization: Bearer {TOKEN}", "-H", "Content-Type: application/json",
        "--data", json.dumps({"query": sql}),
    ], capture_output=True, text=True).stdout
    d = json.loads(out)
    if isinstance(d, dict) and d.get("message"):
        sys.exit(f"✗ {d['message']}")
    return d


def ts(s):
    s = s.strip().replace(" ", "T")
    s = re.sub(r"\+00$", "+00:00", s)
    s = re.sub(r"\.(\d+)", lambda m: "." + (m.group(1) + "000000")[:6], s)
    return datetime.fromisoformat(s)


now = datetime.now(timezone.utc)
d1 = now - timedelta(days=1)

counts = q("""
  select
    (select count(*) from auth.users) as accounts,
    (select count(*) from profiles where onboarding_completed) as onboarded,
    (select count(*) from decisions) as decisions,
    (select count(*) from responses) as responses,
    (select count(*) from outcomes) as outcomes,
    (select count(*) from response_votes) as votes,
    (select count(*) from saved_decisions) as saves
""")[0]

recent_dec = q("""
  select p.display_name as who, d.brand_name, d.product_name, d.confidence_score, d.status, d.created_at
  from decisions d left join profiles p on p.id = d.user_id
  order by d.created_at desc limit 8
""")
recent_resp = q("""
  select p.display_name as who, d.brand_name as on_brand, r.recommendation, r.created_at
  from responses r left join profiles p on p.id = r.user_id
  left join decisions d on d.id = r.decision_id
  order by r.created_at desc limit 8
""")

W = 64
print("\n" + "━" * W)
print("  ELEVENELEVEN — APP ACTIVITY")
print("━" * W)
print(f"  Beta accounts : {counts['accounts']}   (onboarded: {counts['onboarded']})")
print(f"  Decisions     : {counts['decisions']}")
print(f"  Weigh-ins     : {counts['responses']}")
print(f"  Outcomes      : {counts['outcomes']}")
print(f"  Helpful votes : {counts['votes']}")
print(f"  Saves         : {counts['saves']}")
print("━" * W)
print("  RECENT DECISIONS POSTED")
if not recent_dec:
    print("    (none yet)")
for d in recent_dec:
    who = (d.get("who") or "—")
    item = " ".join(x for x in [d.get("brand_name"), d.get("product_name")] if x) or "(item)"
    when = ts(d["created_at"]).astimezone().strftime("%b %-d %-I:%M%p") if d.get("created_at") else ""
    conf = d.get("confidence_score")
    print(f"    {who:<16} {item[:30]:<30} conf {conf if conf is not None else '—'}/10  {d.get('status','')}  {when}")
print("━" * W)
print("  RECENT WEIGH-INS")
if not recent_resp:
    print("    (none yet)")
for r in recent_resp:
    who = (r.get("who") or "—")
    when = ts(r["created_at"]).astimezone().strftime("%b %-d %-I:%M%p") if r.get("created_at") else ""
    print(f"    {who:<16} {r.get('recommendation','')!s:<14} on {r.get('on_brand') or '—':<18} {when}")
print("━" * W + "\n")
