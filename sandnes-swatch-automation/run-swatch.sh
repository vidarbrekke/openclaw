#!/bin/bash
set -euo pipefail
set -a
cd "$(dirname "$0")"
source .env
set +a
node src/automate-swatch-final.js "$@"
