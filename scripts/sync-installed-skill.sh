#!/usr/bin/env bash
# Mirror the source-of-truth skill (build/nanogen/) into the installed
# location (.claude/skills/nanogen/), excluding the dev-only tools/ dir.
#
# build/nanogen/ is where the skill is developed and where `npm test` runs.
# .claude/skills/nanogen/ is the copy Claude Code actually loads on /nanogen.
# They must stay byte-identical (except tools/), enforced by
# tests/test_install_parity.cjs. Run this whenever you change build/nanogen/.
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="build/nanogen"
DST=".claude/skills/nanogen"

if [ ! -d "$SRC" ]; then
  echo "sync-installed-skill: missing source dir $SRC" >&2
  exit 1
fi

# Full mirror: wipe the install and recopy so deletions in build/ propagate
# and no stale files survive. tools/ is dev-only and never shipped.
rm -rf "$DST"
mkdir -p "$DST"
cp -R "$SRC"/. "$DST"/
rm -rf "$DST/tools"

echo "synced $SRC -> $DST (excluded tools/)"
