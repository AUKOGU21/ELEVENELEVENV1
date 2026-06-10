#!/usr/bin/env python3
"""
Send the ElevenEleven "claim your spot" nudge to waitlist invitees who have NOT
yet created a beta account. The recipient list is computed live, so anyone who
has joined by send time is automatically skipped.

Env:
    SUPABASE_ACCESS_TOKEN  - Supabase personal access token (read waitlist/auth)
    RESEND_API_KEY         - Resend API key (send mail)
Optional:
    NUDGE_DRY_RUN=1        - print who WOULD be nudged, send nothing

Usage:
    SUPABASE_ACCESS_TOKEN=sbp_xxx RESEND_API_KEY=re_xxx python3 scripts/send_nudge.py
"""
import os
import sys
import json
import time
import subprocess

PROJECT_REF = "bmiquikoxxukfujnpizp"
SB_TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN")
RESEND_KEY = os.environ.get("RESEND_API_KEY")
DRY_RUN = os.environ.get("NUDGE_DRY_RUN") == "1"
SITE_URL = "https://geteleveneleven.com"
FROM = "ElevenEleven <hello@geteleveneleven.com>"
SUBJECT = "claim your spot"
TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "..", "emails", "nudge.html")

if not SB_TOKEN:
    sys.exit("✗ Set SUPABASE_ACCESS_TOKEN.")
if not RESEND_KEY and not DRY_RUN:
    sys.exit("✗ Set RESEND_API_KEY (or NUDGE_DRY_RUN=1 to preview).")


def curl(args):
    return subprocess.run(args, capture_output=True, text=True).stdout


def query(sql):
    out = curl([
        "curl", "-s", f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        "-H", f"Authorization: Bearer {SB_TOKEN}", "-H", "Content-Type: application/json",
        "--data", json.dumps({"query": sql}),
    ])
    data = json.loads(out)
    if isinstance(data, dict) and data.get("message"):
        sys.exit(f"✗ DB error: {data['message']}")
    return data


# Invited (invited_at set) but NOT joined (no matching auth.users row)
recipients = query(
    """
    select w.first_name, w.email
    from public.waitlist w
    left join auth.users u on lower(u.email) = lower(w.email)
    where w.invited_at is not null and u.id is null
    order by w.invited_at;
    """
)

if not recipients:
    print("Nothing to nudge — every invited person has already joined. ✅")
    sys.exit(0)

template = open(TEMPLATE_PATH).read()
print(f"{'[DRY RUN] ' if DRY_RUN else ''}Nudging {len(recipients)} invited-but-not-joined:\n")

sent = 0
for r in recipients:
    email = (r.get("email") or "").strip()
    first = (r.get("first_name") or "").strip() or "there"
    if DRY_RUN:
        print(f"  would nudge: {first:<14}{email}")
        continue
    html = template.replace("{{FIRST_NAME}}", first).replace("{{SITE_URL}}", SITE_URL)
    payload = json.dumps({
        "from": FROM, "to": [email], "subject": SUBJECT, "html": html,
        "headers": {"List-Unsubscribe": "<mailto:hello@geteleveneleven.com?subject=Unsubscribe>"},
    })
    out = curl([
        "curl", "-s", "https://api.resend.com/emails", "-X", "POST",
        "-H", f"Authorization: Bearer {RESEND_KEY}", "-H", "Content-Type: application/json",
        "--data", payload,
    ])
    try:
        rid = json.loads(out).get("id")
    except Exception:
        rid = None
    print(f"  {'OK ' if rid else 'ERR'} {first:<14}{email:<34}{rid or out[:120]}")
    sent += 1 if rid else 0
    time.sleep(0.7)

if not DRY_RUN:
    print(f"\nSent {sent}/{len(recipients)} nudges.")
