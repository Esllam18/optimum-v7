#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required."
  exit 1
fi
echo "Starting the private Optimum Platform Console at http://localhost:4174"
exec node platform-console/server.mjs
