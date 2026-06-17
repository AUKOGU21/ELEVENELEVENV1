#!/usr/bin/env python3
"""
Send the ElevenEleven "phase II : men" survey email to the men on the waitlist
(the beta is women-first, so these three were held out of the beta invite).
Each link carries the recipient's waitlist id in utm_content, so survey answers
on join.geteleveneleven.com/men attribute back to the person. Stamps
mens_survey_sent_at on success so nobody is sent twice.

Template: emails/mens-survey.html

Env:
    SUPABASE_ACCESS_TOKEN, RESEND_API_KEY
    MENS_DRY_RUN=1  -> show who would be emailed, send nothing

Usage: SUPABASE_ACCESS_TOKEN=sbp_xxx RESEND_API_KEY=re_xxx python3 scripts/send_mens_survey.py
"""
import os, sys, json, time, subprocess

REF = "bmiquikoxxukfujnpizp"
SURVEY_BASE = "https://join.geteleveneleven.com/men"
FROM = "ElevenEleven <hello@geteleveneleven.com>"
SUBJECT = "phase II : men"
SB = os.environ.get("SUPABASE_ACCESS_TOKEN")
KEY = os.environ.get("RESEND_API_KEY")
DRY = os.environ.get("MENS_DRY_RUN") == "1"
TEMPLATE = os.path.join(os.path.dirname(__file__), "..", "emails", "mens-survey.html")
# The men on the waitlist (beta is women-first). Lowercase.
MEN = ("jean.pinatel@essec.edu", "sergeysbelov1@gmail.com", "ahkalex88@gmail.com",
       "jud.asiruwa@hotmail.com")

if not SB:
    sys.exit("✗ Set SUPABASE_ACCESS_TOKEN.")
if not KEY and not DRY:
    sys.exit("✗ Set RESEND_API_KEY (or MENS_DRY_RUN=1).")


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


# Make the stamp column idempotent
query("alter table public.waitlist add column if not exists mens_survey_sent_at timestamptz;")

emails = "','".join(MEN)
rows = query(f"""
  select id, first_name, email from public.waitlist
  where lower(email) in ('{emails}') and mens_survey_sent_at is null
  order by first_name
""")

if not rows:
    print("No men left to email (all already sent). ✅")
    sys.exit(0)

template = open(TEMPLATE).read()
print(f"{'[DRY RUN] ' if DRY else ''}Emailing {len(rows)} man/men:\n")
sent = 0
for r in rows:
    email = r["email"].strip()
    first = (r.get("first_name") or "there").strip()
    url = f"{SURVEY_BASE}?utm_source=mens_email&utm_content={r['id']}"
    if DRY:
        print(f"  would email: {first:<8}{email:<30}{url}")
        continue
    html = template.replace("{{FIRST_NAME}}", first).replace("{{SURVEY_URL}}", url)
    payload = json.dumps({"from": FROM, "to": [email], "subject": SUBJECT, "html": html,
                          "headers": {"List-Unsubscribe": "<mailto:hello@geteleveneleven.com?subject=Unsubscribe>"}})
    out = curl(["curl", "-s", "https://api.resend.com/emails", "-X", "POST",
                "-H", f"Authorization: Bearer {KEY}", "-H", "Content-Type: application/json", "--data", payload])
    try:
        rid = json.loads(out).get("id")
    except Exception:
        rid = None
    if rid:
        query(f"update public.waitlist set mens_survey_sent_at = now() where lower(email) = lower('{email}')")
        sent += 1
    print(f"  {'OK ' if rid else 'ERR'} {first:<8}{email:<30}{rid or out[:120]}")
    time.sleep(0.7)

if not DRY:
    print(f"\nSent {sent}/{len(rows)}.")
