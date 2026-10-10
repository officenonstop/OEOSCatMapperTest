USAGE INSTRUCTIONS:
- When to use: PH0 (Project Setup).
- How to use: Copy this file to `docs/testing/test-strategy.md`, remove this instruction block, and fill in your project's frameworks and targets.
- Purpose: Provides the project-level test philosophy, framework rules, and quality constraints inherited by all feature-level test plans (`test-plan.md`).

# Project Test Strategy

This document establishes the overarching testing standards, framework conventions, and quality gates for this repository under OEOS v6.

---

## 1. Test Levels & Responsibilities

| Level | Scope | Framework | Target Coverage | Execution Frequency |
|---|---|---|---|---|
| **Unit** | Isolated functions, domain logic, state transitions | [e.g. Vitest / pytest] | 100% changed-line (excl. justified) | Every task commit & Gauntlet |
| **Integration** | Database queries, service boundaries, API handlers | [e.g. Vitest / Supertest / pytest] | All critical paths & contracts | Every task commit & Gauntlet |
| **End-to-End (E2E)** | User journeys, critical browser flows, CLI commands | [e.g. Playwright / Bats] | Core revenue/auth user flows | Pre-release / G13 gate |
| **Mutation Testing** | Test suite sensitivity and dead test detection | [e.g. Stryker / mutmut] | High score on modified code | PH5 Gauntlet |

---

## 2. Mocking & Boundary Rules (Absolute)

1. **Never mock the unit under test:** If testing `UserService`, never mock `UserService` methods.
2. **Mock external boundaries only:** Mock network I/O, external payment gateways, system clocks, and third-party APIs.
3. **Do not mock internal domain logic:** Prefer lightweight in-memory databases (e.g. SQLite, test containers) or test factories over mocking internal database repositories.
4. **Deterministic test execution:** Tests must never depend on execution order or shared mutable global state.

---

## 3. Failure Modeling (Tier 3 Tasks)

For high-stakes tasks (authentication, money, data persistence, concurrency, public API contracts), test plans must include an explicit **Failure Model**:
- **Concurrency & Race Conditions:** Stress tests, simultaneous async operations.
- **Partial Failure & Rollback:** Simulating crashes mid-transaction to verify atomic rollbacks.
- **Unclean Inputs & Malicious Payloads:** Fuzzing, boundary value spikes, invalid JSON/types.

---

## 4. Coverage Exclusions (`gauntlet-exclude-next-line`)

100% changed-line coverage is the default standard for new code. Uncovered lines are permitted ONLY if:
- They represent defensive, unreachable type guards (e.g. `default: throw new UnreachableError()`).
- They handle OS-level edge cases impossible to reliably reproduce in test environments.
- Every excluded line carries a standalone comment on the immediately preceding line: `// gauntlet-exclude-next-line: <concrete reason>` (or `#` for Python).
- All exclusions must be cataloged in `docs/features/<slug>/evidence.md` and reviewed at PH6.

---

## 5. Flake Quarantine & Defect Policy

- **Zero Tolerance for Flakes:** If a test is flaky, it must not be ignored or hidden with retry loops.
- **Quarantine Protocol:** A flaky test must be quarantined to a quarantined suite with an open tracking bug. Quarantined tests do not block PH4, but MUST be fixed before milestone release (PH9).
- **Regression Tests:** Every bug fix (BUG.3) must include a failing regression test that reproduces the defect before the fix code is applied.

---

## 6. Static Application Security Testing (SAST - Gate G11)

All changes are subject to automated static application security scans executed directly by the orchestrator via `./tools/sast.sh`:
- **Toolchain:** Gate G11 accepts only the explicit `semgrep` or `bandit` adapter. Set `OEOS_SAST_ADAPTER`, `OEOS_SAST_BINARY` (optional when on PATH), `OEOS_SAST_BINARY_SHA256`, `OEOS_SAST_CONFIG`, and `OEOS_SAST_CONFIG_SHA256`. The runner invokes a fixed argument vector, checks the exact tracked production target inventory, and rejects custom/npm self-reporting. Rust requires the pinned Semgrep adapter; `cargo-audit` remains dependency audit only.
- **Exit Bar:** 0 Critical, 0 High, and 0 Medium vulnerabilities. Independently verified false positives are closed dispositions, not waivers.
- **Commit Binding:** Raw scan logs are bound to the evaluated commit SHA in `logs/sast.log`. Failure to configure or pass SAST blocks Gate G11 fail-closed.

---

## 7. Component and Platform Validation

- Inventory every detected toolchain at every build root, including nested web, Python, Rust, Android/JVM, and native components. Mixed or non-default repositories map each root/toolchain pair in `docs/validation-components.json`; same-root toolchains use separate component entries.
- Each component executes build, tests, static/type checks, lint, dependency/security audit, interaction/public-interface checks, coverage, mutation, and release-artifact production. A missing or unsupported adapter blocks release.
- Android runs local plus instrumented tests on the declared device or emulator. Web UI runs through a real browser. Non-UI components exercise their real public interface.
- `tools/validate-components.cjs` rejects discovered-but-unmapped roots and writes candidate-bound structured evidence; the Gauntlet runner hashes the evidence and adapter controls into its receipt.
