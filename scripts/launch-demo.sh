#!/usr/bin/env bash
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required. Install Python 3, then run this command again." >&2
  exit 1
fi

exec python3 "$(cd "$(dirname "$0")" && pwd)/launch-demo.py" "$@"
