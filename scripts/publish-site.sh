#!/usr/bin/env bash
# Publish index.html to the gh-pages branch.
#
# Pages' legacy builder refuses this repository from `main` — every build fails in zero seconds with
# a bare "Page build failed", while another repository on the same account with a near-identical
# tree publishes normally. Liquid syntax, symlinks, large files, YAML front matter and the forge-std
# submodule were all ruled out by inspection, and .nojekyll made no difference. Rather than keep
# guessing, this publishes a branch containing only the page, which is what otter-arc already does
# successfully on this account.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
SHA=$(git rev-parse --short HEAD)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

cp "$ROOT/index.html" "$STAGE/"
cp "$ROOT/index.html" "$STAGE/404.html"
touch "$STAGE/.nojekyll"

cd "$STAGE"
git init -q
git add -A
git -c user.name='Alex' -c user.email='usurpator100x@yahoo.com' commit -q -m "chore: publish dashboard from $SHA"
git push -q --force "$(git -C "$ROOT" remote get-url origin)" HEAD:gh-pages
echo "[ok] pushed to gh-pages"
