#!/usr/bin/env bash
set -euo pipefail

# Publish the documentation-only main and application dev branches to a dedicated KubeScope repository.
# No force pushes; does not merge application code into main.
tag=v1.0.0
if [[ "$(git branch --show-current)" != dev ]]; then
  echo 'Switch to dev before publishing.' >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Commit or discard local changes before publishing.' >&2
  exit 1
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  echo 'Add the new KubeScope GitHub repository as origin.' >&2
  exit 1
fi
url="$(git remote get-url origin)"
if [[ ! "${url,,}" =~ [:/]kubescope(\.git)?$ ]]; then
  echo "Refusing to publish to a non-KubeScope repository: $url" >&2
  exit 1
fi
if [[ "$(git rev-parse HEAD)" != "$(git rev-list -n1 "$tag")" ]]; then
  echo 'The v1.0.0 tag must point to the current dev commit.' >&2
  exit 1
fi
# Cloning a Git bundle may leave main as origin/main without a local branch.
if ! git show-ref --verify --quiet refs/heads/main; then
  if git show-ref --verify --quiet refs/remotes/origin/main; then
    git branch main refs/remotes/origin/main
  else
    echo 'Missing documentation-only main branch.' >&2
    exit 1
  fi
fi
if git ls-tree -r --name-only main | grep -Ev '^(README\.md|docs/)' ; then
  echo 'main contains non-documentation files. Refusing to publish.' >&2
  exit 1
fi
python3 -m unittest discover -s tests -v
if command -v node >/dev/null 2>&1; then node --check static/app.js; fi
# A non-fast-forward push will fail; no history is overwritten.
git push -u origin main
git push -u origin dev
git push origin "$tag"
echo 'Pushed main documentation, dev application, and the v1.0.0 tag.'
