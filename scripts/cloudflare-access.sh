#!/usr/bin/env bash
#
# Put Cloudflare Access in front of the hostname.
#
# THIS IS THE REAL LOCK. The service has no authentication of any kind: every
# owner route is unauthenticated by design (loopback, no sign-in), and the only
# reason that was ever safe is that nothing was meant to reach the port from
# outside. Publishing it at `policy.strangeramblings.com` broke that assumption
# — `POLICY_READ_ONLY` is the only thing standing between the open internet and
# an assessment that spends the OpenRouter key, and it is switched OFF so real
# papers can be submitted. Access is what makes that switch safe to leave off.
#
# IT RUNS AT THE EDGE, so it needs no deploy, no tunnel restart and no Ansible
# apply. Nothing on porkserv changes. In particular it does not go anywhere near
# cloudflared, which must never be sent SIGHUP.
#
# WHY IT IS NOT AUTOMATIC. `cloudflared login` writes a token to
# `~/.cloudflared/cert.pem` scoped to tunnels, DNS and Access READS — it returns
# `auth.forbidden` on any Access write, so the deploy path cannot do this for
# itself. The token below has to be made once, by hand, and it is the only
# manual step:
#
#   https://dash.cloudflare.com/profile/api-tokens → Create Token → Custom token
#     Account · Access: Apps and Policies · Edit        (required)
#     Account · Access: Organizations, IdPs and Groups · Read   (optional; lets
#                                                        this report the team
#                                                        domain rather than
#                                                        guessing at it)
#     Account Resources → Include → the account this zone is on
#
#   CF_ACCESS_TOKEN=<token> ./scripts/cloudflare-access.sh you@example.com
#
# IDEMPOTENT. Run it again to change who is allowed: it finds the application by
# hostname and replaces its policies rather than adding a second one, because
# two allow policies on one application is how somebody stays allowed after you
# think you have removed them.
#
# TO UNDO IT: delete the application in the Zero Trust dashboard, or
#   ./scripts/cloudflare-access.sh --remove
set -euo pipefail

HOSTNAME_="${POLICY_HOSTNAME:-policy.strangeramblings.com}"
APP_NAME="${POLICY_ACCESS_APP_NAME:-Policy Red Team}"
# 24 hours: long enough not to be a nuisance on a tool you dip into, short
# enough that a session on a borrowed machine does not outlive the day.
SESSION="${POLICY_ACCESS_SESSION:-24h}"

die() { printf '%s\n' "$*" >&2; exit 1; }

[[ -n "${CF_ACCESS_TOKEN:-}" ]] || die "CF_ACCESS_TOKEN is not set. See the header of this script for the two permissions it needs."

# The account id comes off the tunnel certificate rather than being typed in:
# it is already on this machine, and a mistyped account id creates the
# application somewhere nobody will look for it.
CERT="${CLOUDFLARED_CERT:-$HOME/.cloudflared/cert.pem}"
[[ -r "$CERT" ]] || die "No tunnel certificate at $CERT — cannot determine the account. Run cloudflared login, or set CF_ACCOUNT_ID."
ACCOUNT="${CF_ACCOUNT_ID:-$(python3 - "$CERT" <<'PY'
import base64, json, re, sys
raw = open(sys.argv[1]).read()
body = re.search(r'-----BEGIN ARGO TUNNEL TOKEN-----(.*?)-----END', raw, re.S).group(1)
print(json.loads(base64.b64decode(''.join(body.split())))['accountID'])
PY
)}"

API="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/access"
cf() { curl -sS -H "Authorization: Bearer $CF_ACCESS_TOKEN" -H 'Content-Type: application/json' "$@"; }

# Every call is checked. A CLOUDFLARE API FAILURE IS AN HTTP 200 with
# `success: false` and the reason inside the body, so `curl -f` sees nothing
# wrong and `set -e` sails straight past it.
#
# NOT A PIPELINE. The first cut piped `cf … | check … | python3 -c 'read the id'`
# — and because the stages of a pipeline run concurrently, a failed check
# printed its message and the next stage then threw a JSON traceback over the
# top of it. So the response is captured first and checked as a whole.
check() {  # check <what> <json>; prints the result member, or dies
  python3 -c "
import json, sys
d = json.loads(sys.argv[1])
if not d.get('success'):
    sys.exit('$1 failed: ' + json.dumps(d.get('errors')))
print(json.dumps(d.get('result')))
" "$2"
}

existing_id() {
  # CHECKED, because an empty answer here means "no application on this
  # hostname" and drives a create. A list call that FAILED also returns nothing,
  # and acting on that would put a second application on the same hostname —
  # two applications on one hostname is a race about whose policy wins.
  local listed
  listed="$(check 'list applications' "$(cf "$API/apps")")"
  python3 -c "
import json, sys
for a in json.loads(sys.argv[1]) or []:
    if a.get('domain') == '$HOSTNAME_':
        print(a['id']); break
" "$listed"
}

if [[ "${1:-}" == "--remove" ]]; then
  id="$(existing_id)"
  [[ -n "$id" ]] || die "No Access application on $HOSTNAME_ — nothing to remove."
  check 'delete' "$(cf -X DELETE "$API/apps/$id")" >/dev/null
  echo "Removed. $HOSTNAME_ is open to anyone who knows the name again."
  exit 0
fi

(( $# )) || die "Usage: CF_ACCESS_TOKEN=… $0 <email> [more emails…]"

check 'token verify' "$(cf https://api.cloudflare.com/client/v4/user/tokens/verify)" >/dev/null
echo "Token accepted. Account $ACCOUNT."

# The team domain is what the login page lives on. Reported rather than
# required: without it Access still works, but a reader who has never seen the
# Zero Trust dashboard has no idea what the redirect they are about to meet is.
team="$(cf "$API/organizations" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print((d.get('result') or {}).get('auth_domain', '') if d.get('success') else '')
" || true)"
if [[ -n "$team" ]]; then
  echo "Zero Trust team domain: $team"
else
  echo "Could not read the team domain (the token has no Organizations scope, or Zero Trust has never been set up on this account)."
  echo "If the check at the end fails, open https://one.dash.cloudflare.com and complete the one-off team-name step, then run this again."
fi

app="$(existing_id)"
body="$(python3 -c "
import json
print(json.dumps({
    'name': '$APP_NAME',
    'domain': '$HOSTNAME_',
    'type': 'self_hosted',
    'session_duration': '$SESSION',
    # Every method the account offers, which on an account with no identity
    # provider configured means Cloudflare's own one-time PIN: a code to the
    # address below. Nothing to set up, and no third party in the path.
    'allowed_idps': [],
    'auto_redirect_to_identity': False,
    'app_launcher_visible': True,
    'http_only_cookie_attribute': True,
}))")"

if [[ -n "$app" ]]; then
  echo "Application already exists ($app) — updating it."
  check 'update application' "$(cf -X PUT --data "$body" "$API/apps/$app")" >/dev/null
else
  created="$(check 'create application' "$(cf -X POST --data "$body" "$API/apps")")"
  app="$(python3 -c 'import json, sys; print(json.loads(sys.argv[1])["id"])' "$created")"
  echo "Created application $app."
fi

# REPLACED, NOT ADDED TO. Two allow policies on one application is how somebody
# stays allowed after you think you have removed them.
for old in $(python3 -c "
import json, sys
for p in json.loads(sys.argv[1]) or []: print(p['id'])
" "$(check 'list policies' "$(cf "$API/apps/$app/policies")")"); do
  cf -X DELETE "$API/apps/$app/policies/$old" >/dev/null
done

policy="$(python3 -c "
import json, sys
print(json.dumps({
    'name': 'Allowed people',
    'decision': 'allow',
    'include': [{'email': {'email': e}} for e in sys.argv[1:]],
}))" "$@")"
check 'create policy' "$(cf -X POST --data "$policy" "$API/apps/$app/policies")" >/dev/null
echo "Allowed: $*"

# THE ONLY CHECK THAT MEANS ANYTHING. An application that exists and does not
# enforce looks exactly like one that does, from the dashboard. A locked
# hostname answers an anonymous request with a redirect to the login page, so
# that is what is asserted — against the live hostname, from outside.
echo
echo "Checking $HOSTNAME_ from outside…"
sleep 3
code="$(curl -s -o /dev/null -w '%{http_code}' "https://$HOSTNAME_/")"
location="$(curl -sI "https://$HOSTNAME_/" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')"
if [[ "$code" == 302 && "$location" == *cloudflareaccess.com* ]]; then
  echo "LOCKED. Anonymous requests now go to $location"
else
  echo "NOT LOCKED YET: the hostname answered $code${location:+ → $location}."
  echo "Access can take a minute to take effect. If it stays open, check that Zero Trust is set up on the account."
  exit 1
fi
