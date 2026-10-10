---
description: Inspect or configure OEOS subagent models, presets, and independence checks.
---

You are invoked via the `/oeos-models` command.

User arguments:

$ARGUMENTS

Execute the appropriate action based on the user arguments:

1. **If arguments specify a preset (e.g., `standard`, `budget`, `frontier`, or `--preset <name>`):**
   - Determine which script is available: `tools/configure-models.sh` (target project) or `runbook/configure-models.sh` (runbook package).
   - Execute the preset: `bash tools/configure-models.sh --preset <name>` (or `runbook/configure-models.sh`).
   - Run `--status` to verify independence and display the updated assignments.

2. **If arguments specify `--status` or `status`:**
   - Execute `bash tools/configure-models.sh --status` (or `bash runbook/configure-models.sh --status`).
   - Report the status table and highlight any reviewer independence collisions.

3. **If arguments specify `--list-models` or `list`:**
   - Execute `bash tools/configure-models.sh --list-models` (or `bash runbook/configure-models.sh --list-models`).
   - Display the discovered models from OpenCode configuration and live provider endpoints.

4. **If arguments specify `--set` or `<agent>=<model>`:**
   - Execute `bash tools/configure-models.sh --set <assignment>`.
   - Run `--status` to confirm the change.

5. **If arguments are empty, `interactive`, or anything else:**
   - Run `bash tools/configure-models.sh --status` (or `runbook/configure-models.sh --status`) to show current assignments.
   - Inform the user:
     "To launch the interactive search-as-you-type TUI, run this command in your terminal:
     ```bash
     bash tools/configure-models.sh
     ```
     (or `bash runbook/configure-models.sh` if working within the runbook package)."
