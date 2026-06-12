#!/usr/bin/env python3
"""
Send the ElevenEleven "you're in." beta invite to waitlist signups who have not
been invited yet (invited_at is null) and have not already joined. Stamps
invited_at on success so nobody is ever invited twice. Skips a hard-coded
exclude list (men, since the beta is women-first).

Env:
    SUPABASE_ACCESS_TOKEN, RESEND_API_KEY
    INVITE_DRY_RUN=1  -> list who WOULD be invited, send nothing

Usage: SUPABASE_ACCESS_TOKEN=sbp_xxx RESEND_API_KEY=re_xxx python3 scripts/send_invites.py
"""
import os, sys, json, time, subprocess

REF = "bmiquikoxxukfujnpizp"
SB = os.environ.get("SUPABASE_ACCESS_TOKEN")
KEY = os.environ.get("RESEND_API_KEY")
DRY = os.environ.get("INVITE_DRY_RUN") == "1"
# Excluded from beta invites (men — the beta is women-first). Lowercase.
EXCLUDE = {"jean.pinatel@essec.edu", "sergeysbelov1@gmail.com"}
TEMPLATE = os.path.join(os.path.dirname(__file__), "..", "emails", "invite.html")

if not SB:
    sys.exit("✗ Set SUPABASE_ACCESS_TOKEN.")
if not KEY and not DRY:
    sys.exit("✗ Set RESEND_API_KEY (or INVITE_DRY_RUN=1).")


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


# Not yet invited, not yet joined
rows = query("""
  select w.first_name, w.email
  from public.waitlist w
  left join auth.users u on lower(u.email) = lower(w.email)
  where w.invited_at is null and u.id is null
  order by w.created_at
""")
targets = [r for r in rows if (r.get("email") or "").lower() not in EXCLUDE]

if not targets:
    print("No new signups to invite. ✅")
    sys.exit(0)

template = open(TEMPLATE).read()
print(f"{'[DRY RUN] ' if DRY else ''}Inviting {len(targets)} new signup(s):\n")
sent = 0
for r in targets:
    email = r["email"].strip()
    first = (r.get("first_name") or "there").strip()
    if DRY:
        print(f"  would invite: {first:<16}{email}")
        continue
    html = template.replace("{{FIRST_NAME}}", first).replace("{{SITE_URL}}", "https://geteleveneleven.com")
    payload = json.dumps({"from": "ElevenEleven <hello@geteleveneleven.com>", "to": [email],
                          "subject": "you're in.", "html": html,
                          "headers": {"List-Unsubscribe": "<mailto:hello@geteleveneleven.com?subject=Unsubscribe>"}})
    out = curl(["curl", "-s", "https://api.resend.com/emails", "-X", "POST",
                "-H", f"Authorization: Bearer {KEY}", "-H", "Content-Type: application/json", "--data", payload])
    try:
        rid = json.loads(out).get("id")
    except Exception:
        rid = None
    if rid:
        query(f"update public.waitlist set invited_at = now() where lower(email) = lower('{email}')")
        sent += 1
    print(f"  {'OK ' if rid else 'ERR'} {first:<16}{email:<34}{rid or out[:100]}")
    time.sleep(0.7)

if not DRY:
    print(f"\nInvited {sent}/{len(targets)}.")
