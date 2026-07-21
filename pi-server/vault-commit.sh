#!/usr/bin/env bash
# Commit the two Kanban export files into the vault and push. Invoked by the
# Kanban API (pi-server/vaultExport.js) INSIDE the container, already wrapped in
# `flock <vault>/.git/alfred-write.lock` — so it must NOT take the lock itself.
# That shared lock serialises this with vault-sync and the vault API's writes.
#
# Args: <json-source> <summary-source> — temp files the server has written with
# the fresh export content. This script owns only the git side.
#
# Echoes a status token on stdout: COMMITTED (new commit pushed) or NOCHANGE
# (export identical to what's already committed). Non-zero exit on failure, with
# the working tree reset back to origin so it is never left dirty.
set -euo pipefail

VAULT_PATH="${VAULT_PATH:-/vault}"
EXPORT_DIR="${EXPORT_DIR:-4-dev-hub}"
GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Alfred}"
GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-alfred@alfred.local}"

JSON_SRC="$1"
SUMMARY_SRC="$2"
JSON_REL="${EXPORT_DIR}/kanban-export.json"
SUMMARY_REL="${EXPORT_DIR}/kanban-summary.md"

cd "${VAULT_PATH}"

# --ff-only for the same reason as vault-sync: the Pi is a mirror and every
# writer pushes immediately. A divergence is a real problem — fail loudly.
git pull --ff-only >/dev/null 2>&1

install -m 644 "${JSON_SRC}"    "${JSON_REL}"
install -m 644 "${SUMMARY_SRC}" "${SUMMARY_REL}"

git add -- "${JSON_REL}" "${SUMMARY_REL}"
if git diff --cached --quiet; then
    echo "NOCHANGE"
    exit 0
fi

if ! git -c "user.name=${GIT_AUTHOR_NAME}" -c "user.email=${GIT_AUTHOR_EMAIL}" \
        commit -q -m "alfred kanban: export board to vault" >/dev/null 2>&1; then
    git reset -q --hard '@{upstream}' || true
    echo "commit failed" >&2
    exit 1
fi

if ! git push -q >/dev/null 2>&1; then
    git reset -q --hard '@{upstream}' || true
    echo "push failed" >&2
    exit 1
fi

echo "COMMITTED"
