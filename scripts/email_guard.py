"""
Every send script goes through this before it emails anyone.

  excluded(query)                 -> addresses that must not get a campaign
  excluded(query, transactional=True)
                                  -> only the unsubscribed (scope 'all'): use for
                                     one-off notifications about her own posts
  unsub_url(email)                -> her signed geteleveneleven.com/unsubscribe link
  unsub_headers(email)            -> List-Unsubscribe + one-click headers for Resend

The list lives in admin.email_exclude. Unsubscribes arrive there on their own
(the link and Gmail/Apple Mail's Unsubscribe button both land on the
unsubscribe edge function); add anyone else there by hand, with a reason.

UNSUB_SECRET comes from .env.local and must match the edge function's secret.
"""
import hashlib
import hmac
import os
import urllib.parse

SITE = "https://geteleveneleven.com"
MAILTO = "mailto:hello@geteleveneleven.com?subject=Unsubscribe"


def _secret():
    s = os.environ.get("UNSUB_SECRET")
    if s:
        return s
    path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if os.path.exists(path):
        for line in open(path):
            if line.strip().startswith("UNSUB_SECRET="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("✗ UNSUB_SECRET missing from .env.local: unsubscribe links can't be signed.")


def unsub_url(email):
    e = email.strip().lower()
    t = hmac.new(_secret().encode(), e.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{SITE}/unsubscribe?e={urllib.parse.quote(e)}&t={t}"


def unsub_headers(email):
    # The https link first, so Gmail and Apple Mail use one-click; mailto as a fallback.
    return {
        "List-Unsubscribe": f"<{unsub_url(email)}>, <{MAILTO}>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }


def excluded(query, transactional=False):
    where = "where scope = 'all'" if transactional else ""
    return {r["email"].lower() for r in query(f"select email from admin.email_exclude {where}")}
