USAGE INSTRUCTIONS:
- When to use: PH0 (Project Setup).
- How to use: Copy this file to the project root as `AGENTS.md`, remove this instruction block, and fill in the bracketed fields with your project's real commands and stack.
- Purpose: Provides essential repository facts (test/build/lint commands and tech stack) to any agent without duplicating the OEOS process manual.

# [Project Name]

## Overview
[Brief paragraph describing what this project does and who uses it.]

## Tech Stack
- **Language & Runtime:** [e.g., TypeScript / Node.js 20, Python 3.12, Rust 1.80]
- **Framework:** [e.g., Next.js, FastAPI, Axum]
- **Database / Storage:** [e.g., PostgreSQL + Prisma, SQLite]
- **Testing Frameworks:** [e.g., Vitest, pytest, cargo test]

## Executable Commands (Single Source of Truth)
- **Validation Entry Point:** `./tools/gauntlet.sh`
- **Canonical Gauntlet Runner (pipefail-safe):** `./tools/run-gauntlet.sh [logs/<name>.log]` (all generated artifact paths must remain under `logs/`)
- **Automated SAST Runner (Gate G11):** `./tools/sast.sh [logs/<name>.log]` with `OEOS_SAST_ADAPTER`, a pinned `OEOS_SAST_BINARY_SHA256`, and a pinned `OEOS_SAST_CONFIG_SHA256`; arbitrary custom commands and output paths outside `logs/` are rejected
- **Approved-test ledger:** `node tools/verify-approved-tests.cjs verify <approved-tests.json>`
- **Active tracker/base resolver:** `node tools/resolve-tracker-context.cjs --field json`
- **Configure Subagent Models:** `bash tools/configure-models.sh` (or `/oeos-models` in OpenCode)
- **Run Full Test Suite:** `[e.g., npm test / pytest]`
- **Run Changed-Line Coverage:** `[e.g., npm run test:coverage / pytest --cov --cov-report=json:coverage.json]`
- **Run Mutation Testing:** `[e.g., npm run test:mutation / npx stryker run / mutmut run]`
- **Run SAST Scan:** `./tools/sast.sh` (after supplying the pinned adapter/binary/config environment above)
- **Run Single Test File:** `[e.g., npx vitest run <file> / pytest <file>]`
- **Lint & Static Check:** `[e.g., npm run lint / ruff check .]`
- **Build / Compile:** `[e.g., npm run build / cargo build]`
- **Typecheck:** `[e.g., npx tsc --noEmit / mypy .]`
- **Architecture Memory (CodeGraph):** `codegraph explore <symbol>` (CLI fallback for all subagents)

## Codebase Organization & Standards
- **Project directory and ownership map:** [Record actual production, coder-owned unit/component, QA-owned acceptance/E2E, shared-fixture, generated, and release-artifact paths. Do not assume a web-only `tests/` layout. Android normally uses module source sets such as `src/test/` and `src/androidTest/`; Rust may use inline unit modules plus `tests/` or workspace crates. Ownership follows test purpose.]
- **Component validation:** [For Android/Gradle, Rust, nested-root, mixed-stack, or multi-root repositories, adapt a shipped `VALIDATION_COMPONENTS_*_EXAMPLE.json` into `docs/validation-components.json` and map every detected toolchain at every build root; same-root toolchains use separate component entries.]
- UI implementations must reference design tokens in `DESIGN.md`.
- Consequential architectural decisions require an Architecture Decision Record in `docs/adr/`.
- Code standards: follow `docs/coding-standards.md`.

## Engineering Process (OEOS v6)
This repository follows the **OpenCode Engineering Operating System (OEOS) v6**.
- **Active Work State:** All work items are driven via `docs/features/<slug>/tracker.md` (or `docs/bugs/<slug>/tracker.md`).
- **Feature Isolation:** Feature tasks are developed autonomously on `feature/<slug>` or `bug/<slug>` branches.
- **Process Manual:** See `docs/handbook/OEOS_v6_Handbook.md`.
