#!/usr/bin/env python3
"""
Send the "you're missing the good part" email to ElevenEleven ACCOUNT holders.

Note the audience: this one goes to auth.users, not the waitlist. Those are two
different lists, and the waitlist has been dormant since August.

Safe by design:
  - WW_DRY_RUN=1  -> list who WOULD receive it, send nothing
  - WW_TEST_TO=addr -> send one test copy to `addr` only, then exit
  - records admin.email_sends so a re-run never emails anyone twice
  - skips the men on the women-first EXCLUDE list

Env: SUPABASE_ACCESS_TOKEN, RESEND_API_KEY
Usage:
  test:  WW_TEST_TO=alexiskukogu@gmail.com SUPABASE_ACCESS_TOKEN=sbp_x RESEND_API_KEY=re_x python3 scripts/send_whats_waiting.py
  dry:   WW_DRY_RUN=1 SUPABASE_ACCESS_TOKEN=sbp_x python3 scripts/send_whats_waiting.py
  send:  SUPABASE_ACCESS_TOKEN=sbp_x RESEND_API_KEY=re_x python3 scripts/send_whats_waiting.py
"""
import os, sys, json, time, subprocess

REF = "bmiquikoxxukfujnpizp"
CAMPAIGN = "whats_waiting_2026_09"
SB = os.environ.get("SUPABASE_ACCESS_TOKEN")
KEY = os.environ.get("RESEND_API_KEY")
DRY = os.environ.get("WW_DRY_RUN") == "1"
TEST_TO = os.environ.get("WW_TEST_TO")
SUBJECT = os.environ.get("WW_SUBJECT", "you're missing the good part")
UNSUB = "mailto:hello@geteleveneleven.com?subject=Unsubscribe"
SITE = "https://geteleveneleven.com"
EXCLUDE = {"jean.pinatel@essec.edu", "sergeysbelov1@gmail.com", "ahkalex88@gmail.com",
           "jud.asiruwa@hotmail.com"}
TEMPLATE = os.path.join(os.path.dirname(__file__), "..", "emails", "whats-waiting.html")

if not SB:
    sys.exit("✗ Set SUPABASE_ACCESS_TOKEN. Both old tokens are dead as of 2026-09-09; "
             "generate a fresh one at supabase.com/dashboard/account/tokens")
if not KEY and not DRY:
    sys.exit("✗ Set RESEND_API_KEY (or WW_DRY_RUN=1).")

template = open(TEMPLATE).read()


def curl(a):
    return subprocess.run(a, capture_output=True, text=True).stdout


def query(sql):
    out = curl(["curl", "-s", f"https://api.supabase.com/v1/projects/{REF}/database/query",
                "-H", f"Authorization: Bearer {SB}", "-H", "Content-Type: application/json",
                "--data", json.dumps({"query": sql})])
    d = json.loads(out) if out.strip() else []
    if isinstance(d, dict) and d.get("message"):
        sys.exit("✗ DB error: " + d["message"])
    return d


def send(email, first, onboarded=True):
    # Someone who never finished signing up cannot weigh in, so don't ask her to.
    label = "Weigh in" if onboarded else "Finish setting up"
    url = SITE + ("/feed" if onboarded else "/onboarding")
    html = (template
            .replace("{{FIRST_NAME}}", first)
            .replace("{{UNSUBSCRIBE_URL}}", UNSUB)
            .replace("{{CTA_LABEL}}", label)
            .replace("{{CTA_URL}}", url))
    payload = json.dumps({"from": "ElevenEleven <hello@geteleveneleven.com>", "to": [email],
                          "subject": SUBJECT, "html": html,
                          "headers": {"List-Unsubscribe": f"<{UNSUB}>"}})
    out = curl(["curl", "-s", "https://api.resend.com/emails", "-X", "POST",
                "-H", f"Authorization: Bearer {KEY}", "-H", "Content-Type: application/json",
                "--data", payload])
    try:
        return json.loads(out).get("id"), out
    except Exception:
        return None, out


if TEST_TO:
    mid, raw = send(TEST_TO, "there")
    print(("✓ test sent to " + TEST_TO + " (" + str(mid) + ")") if mid else ("✗ " + raw))
    sys.exit(0)

rows = query(f"""
  select u.email, coalesce(split_part(p.display_name, ' ', 1), '') as first,
         coalesce(p.onboarding_completed, false) as onboarded
  from auth.users u
  join public.profiles p on p.id = u.id
  where u.email is not null
    and not exists (select 1 from admin.email_sends e
                    where e.user_id = u.id and e.campaign = '{CAMPAIGN}')
  order by u.created_at
""")

people = [r for r in rows if r["email"].lower() not in EXCLUDE]
print(f"{len(people)} to email ({len(rows) - len(people)} excluded)")

if DRY:
    for r in people:
        cta = "Weigh in" if r["onboarded"] else "FINISH SETTING UP"
        print("  ", r["email"], "-", r["first"] or "(no name)", "|", cta)
    sys.exit(0)

sent = 0
for r in people:
    mid, raw = send(r["email"], r["first"] or "there", bool(r["onboarded"]))
    if mid:
        query(f"""insert into admin.email_sends (user_id, campaign)
                  select id, '{CAMPAIGN}' from auth.users where email = '{r["email"]}'
                  on conflict do nothing""")
        sent += 1
        print("  ✓", r["email"])
    else:
        print("  ✗", r["email"], raw[:160])
    time.sleep(0.6)

print(f"done: {sent}/{len(people)} sent")
