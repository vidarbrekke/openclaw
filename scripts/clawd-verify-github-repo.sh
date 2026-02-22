#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: clawd-verify-github-repo <local_repo_path> <owner/repo>" >&2
  exit 2
fi

LOCAL_REPO="$1"
REMOTE_REPO="$2"

if [ ! -d "$LOCAL_REPO" ]; then
  echo "ERROR: local path does not exist: $LOCAL_REPO" >&2
  exit 2
fi

if [ ! -d "$LOCAL_REPO/.git" ]; then
  echo "ERROR: not a git repository: $LOCAL_REPO" >&2
  exit 2
fi

OWNER="${REMOTE_REPO%%/*}"
REPO="${REMOTE_REPO##*/}"

echo "local_repo=$LOCAL_REPO"
echo "remote_repo=$OWNER/$REPO"
echo

echo "== local git state =="
git -C "$LOCAL_REPO" remote -v | sed -n '1,4p'
LOCAL_HEAD="$(git -C "$LOCAL_REPO" rev-parse HEAD)"
LOCAL_BRANCH="$(git -C "$LOCAL_REPO" rev-parse --abbrev-ref HEAD)"
echo "local_branch=$LOCAL_BRANCH"
echo "local_head=$LOCAL_HEAD"
echo

echo "== remote lookup (method 1: API) =="
API_CODE="$(curl -s -o /tmp/clawd_repo_api.json -w '%{http_code}' "https://api.github.com/repos/$OWNER/$REPO")"
echo "api_status=$API_CODE"
if [ "$API_CODE" = "200" ]; then
  python3 - <<'PY'
import json
j=json.load(open('/tmp/clawd_repo_api.json'))
print("api_full_name=", j.get("full_name"))
print("api_default_branch=", j.get("default_branch"))
PY
else
  echo "api_error=$(python3 - <<'PY'
import json
try:
    j=json.load(open('/tmp/clawd_repo_api.json'))
    print(j.get("message","unknown"))
except Exception:
    print("unknown")
PY
)"
fi
echo

echo "== remote lookup (method 2: git) =="
GIT_URL="https://github.com/$OWNER/$REPO.git"
if git ls-remote "$GIT_URL" >/tmp/clawd_ls_remote.txt 2>/tmp/clawd_ls_remote.err; then
  echo "git_ls_remote=ok"
  REMOTE_HEAD="$(awk '/\sHEAD$/ {print $1; exit}' /tmp/clawd_ls_remote.txt)"
  if [ -n "${REMOTE_HEAD:-}" ]; then
    echo "remote_head=$REMOTE_HEAD"
    if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
      echo "match=local_head_equals_remote_head"
    else
      echo "match=local_head_differs_from_remote_head"
    fi
  else
    echo "remote_head=unknown"
  fi
else
  echo "git_ls_remote=failed"
  echo "git_error=$(tr '\n' ' ' </tmp/clawd_ls_remote.err | sed -n '1p')"
fi
