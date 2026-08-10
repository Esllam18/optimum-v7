#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required."
  exit 1
fi
echo "Starting Optimum 6.9.0 client application at http://localhost:4173"
exec node server.mjs
