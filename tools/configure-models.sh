#!/usr/bin/env bash
# ==============================================================================
# OEOS v6 — Subagent Model Configuration Tool
# Interactive search-as-you-type TUI & CLI for configuring subagent models.
#
# Usage:
#   bash tools/configure-models.sh                      # Launch interactive dashboard
#   bash tools/configure-models.sh --status             # View current models & independence
#   bash tools/configure-models.sh --status --waiver <r># Verify independence with explicit human waiver
#   bash tools/configure-models.sh --preset standard    # Apply standard preset (standard, budget, frontier)
#   bash tools/configure-models.sh --set <agent>=<id>   # Set model for specific subagent
#   bash tools/configure-models.sh --list-models        # List all discovered models
#   bash tools/configure-models.sh --agent-dir <path>   # Explicitly target agent directory
#   bash tools/configure-models.sh --list-models --cached # Skip live OpenCode inventory resolution
#   (or run bash runbook/configure-models.sh from runbook folder)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_SCRIPT="$SCRIPT_DIR/scripts/configure-models.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is required to run the interactive model selector." >&2
  echo "Install Node.js >= 18 or run: bash runbook/prereqs-install.sh" >&2
  exit 1
fi

if [ ! -f "$NODE_SCRIPT" ]; then
  # Fallback candidate paths depending on invocation directory
  if [ -f "$SCRIPT_DIR/tools/scripts/configure-models.mjs" ]; then
    NODE_SCRIPT="$SCRIPT_DIR/tools/scripts/configure-models.mjs"
  elif [ -f "$SCRIPT_DIR/runbook/scripts/configure-models.mjs" ]; then
    NODE_SCRIPT="$SCRIPT_DIR/runbook/scripts/configure-models.mjs"
  elif [ -f "$SCRIPT_DIR/../runbook/scripts/configure-models.mjs" ]; then
    NODE_SCRIPT="$SCRIPT_DIR/../runbook/scripts/configure-models.mjs"
  fi
fi

if [ ! -f "$NODE_SCRIPT" ]; then
  echo "ERROR: Model configuration script not found at: $NODE_SCRIPT" >&2
  exit 1
fi

exec node "$NODE_SCRIPT" "$@"
