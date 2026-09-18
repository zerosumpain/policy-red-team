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
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${1:-}" != "--no-build" ]]; then
  echo "building"
  npm run build >/dev/null
fi

for required in dist/server.js dist/client/index.html static/policy-offline/app.js; do
  [[ -f "$required" ]] || { echo "missing $required — run npm run build" >&2; exit 1; }
done

echo "shipping to $HOST:$DEST"
# node_modules goes too: the bundles are built with `packages: 'external'`, so the
# dependencies are needed at runtime and `npm ci` on the box would be a second
# resolution that could differ from the one that was tested.
rsync -a --delete \
  --exclude '.git' \
  --exclude '.data' \
  --exclude 'shots' \
  --exclude '.env' \
  ./ "$HOST:$DEST/"

echo "restarting"
# shellcheck disable=SC2029
ssh "$HOST" 'sudo systemctl restart policy-red-team && sleep 3 && systemctl is-active policy-red-team && curl -fsS http://127.0.0.1:5290/health'
echo
echo "deployed"
