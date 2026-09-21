#!/usr/bin/env bash
#
# Deploy the built application to porkserv.
#
# The same split the gate lane uses: `~/porkserv/policy.yml` owns packages,
# directories, units and configuration; this owns the source tree, because rsync
# is better at trees than Ansible is.
#
# IT BUILDS HERE AND SHIPS THE RESULT. porkserv has the right Node (22.23.2) and
# could build for itself, but a build on the box is a build nobody watched: this
# way the thing that ships is the thing that passed a gate on the machine where
# the gates run.
#
#   ./scripts/deploy-porkserv.sh            build, ship, restart
#   ./scripts/deploy-porkserv.sh --no-build ship what is already in dist/
set -euo pipefail

HOST="${POLICY_DEPLOY_HOST:-porkserv}"
DEST=/opt/policy-red-team
# TWO LEVELS UP, because this lives in deploy/estate/. It was one, and moving
# the script in phase 18 without changing this would have rsynced `deploy/` over
# /opt/policy-red-team — the checks below would have caught it, but only after
# the tree had already gone.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" != "--no-build" ]]; then
  echo "building"
  npm run build >/dev/null
fi

for required in dist/server.js dist/client/index.html static/policy-offline/app.js; do
  [[ -f "$required" ]] || { echo "missing $required — run npm run build" >&2; exit 1; }
done

echo "shipping to $HOST:$DEST"
# `data/` IS THIS MACHINE'S KEYS, and it is excluded for the same reason `.env`
# is. `keyDir()` falls back to `<cwd>/data/policy-keys` when POLICY_SEAL_KEY_DIR
# is unset, so the local tree holds the AES key that encrypts THIS machine's
# settings — the provider secrets among them. porkserv sets the variable and
# keeps its own keys in /var/lib/policy-red-team/keys, so copying ours over
# breaks nothing there today; it would simply put a working key to our secrets
# in a directory on another box, and one env change away from being the key that
# box reads instead of its own.
# node_modules goes too: the bundles are built with `packages: 'external'`, so the
# dependencies are needed at runtime and `npm ci` on the box would be a second
# resolution that could differ from the one that was tested.
rsync -a --delete \
  --exclude '.git' \
  --exclude '.data' \
  --exclude 'shots' \
  --exclude '.env' \
  --exclude 'data' \
  ./ "$HOST:$DEST/"

echo "restarting"
# shellcheck disable=SC2029
ssh "$HOST" 'sudo systemctl restart policy-red-team && sleep 3 && systemctl is-active policy-red-team && curl -fsS http://127.0.0.1:5290/health'
echo
echo "deployed"
