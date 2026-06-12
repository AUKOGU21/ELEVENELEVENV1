#!/usr/bin/env python3
"""
Manually send an ElevenEleven "you got a weigh-in" email to the owner of a
decision someone weighed in on. The live app fires this automatically via the
notify-weigh-in edge function; this script is for backfilling a weigh-in that
happened before the function existed, or re-sending one by hand.

By default it targets the MOST RECENT weigh-in (skipping self-weigh-ins). Pass a
decision_id to target that decision's latest weigh-in instead.

Uses the same template as the edge function: emails/weigh-in.html

Env:
    SUPABASE_ACCESS_TOKEN, RESEND_API_KEY
    NOTIFY_DRY_RUN=1   -> show who would be notified, send nothing

Usage:
    SUPABASE_ACCESS_TOKEN=sbp_xxx RESEND_API_KEY=re_xxx python3 scripts/notify_weighin.py [decision_id]
"""
import os, sys, json, subprocess

REF = "bmiquikoxxukfujnpizp"
SITE_URL = "https://geteleveneleven.com"
FROM = "ElevenEleven <hello@geteleveneleven.com>"
SB = os.environ.get("SUPABASE_ACCESS_TOKEN")
KEY = os.environ.get("RESEND_API_KEY")
DRY = os.environ.get("NOTIFY_DRY_RUN") == "1"
TEMPLATE = os.path.join(os.path.dirname(__file__), "..", "emails", "weigh-in.html")
decision_id = sys.argv[1] if len(sys.argv) > 1 else None

if not SB:
    sys.exit("✗ Set SUPABASE_ACCESS_TOKEN.")
if not KEY and not DRY:
    sys.exit("✗ Set RESEND_API_KEY (or NOTIFY_DRY_RUN=1).")


def curl(a):
    return subprocess.run(a, capture_output=True, text=True).stdout


def query(sql):
    out = curl(["curl", "-s", f"https://api.supabase.com/v1/projects/{REF}/database/query",
                "-H", f"Authorization: Bearer {SB}", "-H", "Content-Type: application/json",
                "--data", json.dumps({"query": sql})])
    d = json.loads(out)
    if isinstance(d, dict) and d.get("message"):
        sys.exit("✗ DB error: " + d["message"])
    return d


where = f"and d.id = '{decision_id}'" if decision_id else ""
rows = query(f"""
  select d.id as decision_id, d.brand_name, d.product_name,
         owner.email as owner_email, ownerp.display_name as owner_name,
         resp.display_name as responder_name, r.created_at
  from responses r
  join decisions d on d.id = r.decision_id
  join auth.users owner on owner.id = d.user_id
  left join profiles ownerp on ownerp.id = d.user_id
  left join profiles resp on resp.id = r.user_id
  where d.user_id <> r.user_id {where}
  order by r.created_at desc
  limit 1
""")

if not rows:
    print("No weigh-in found to notify on. ✅")
    sys.exit(0)

row = rows[0]
owner_email = (row.get("owner_email") or "").strip()
owner_name = (row.get("owner_name") or "there").strip()
responder = ((row.get("responder_name") or "someone").strip().split() or ["someone"])[0]
item = " ".join(x for x in [row.get("brand_name"), row.get("product_name")] if x).strip() or "your pick"
subject = f"{responder} weighed in on your {item}" if item != "your pick" else f"{responder} weighed in on your pick"

print(f"{'[DRY RUN] ' if DRY else ''}Notify {owner_name} <{owner_email}>")
print(f"  responder : {responder}")
print(f"  item      : {item}")
print(f"  subject   : {subject}")

if not owner_email:
    sys.exit("✗ No owner email on that decision.")
if DRY:
    sys.exit(0)

html = (open(TEMPLATE).read()
        .replace("{{RESPONDER}}", responder)
        .replace("{{ITEM}}", item)
        .replace("{{SITE_URL}}", SITE_URL))

payload = json.dumps({"from": FROM, "to": [owner_email], "subject": subject, "html": html,
                      "headers": {"List-Unsubscribe": "<mailto:hello@geteleveneleven.com?subject=Unsubscribe>"}})
out = curl(["curl", "-s", "https://api.resend.com/emails", "-X", "POST",
            "-H", f"Authorization: Bearer {KEY}", "-H", "Content-Type: application/json", "--data", payload])
try:
    rid = json.loads(out).get("id")
except Exception:
    rid = None
print(f"\n{'OK  sent ' + str(rid) if rid else 'ERR ' + out[:160]}")
