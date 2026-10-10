USAGE INSTRUCTIONS:
- When to use: Generated initially at PH5.2 from Gauntlet execution logs; audited by GLM at PH6.1; finalized at PH8.4 with fresh numbers. Human verifies and signs off at Gate G13.
- How to use: Copy this file to `docs/features/<slug>/evidence.md`, remove this instruction block, and fill in the bracketed fields. All numbers must be piped directly from `./tools/gauntlet.sh` execution logs.

# Evidence Report — <feature name> (Tier <1|2|3>)

**Feature:** [Name]  
**Automated Execution By:** Orchestrator (`oeos`) / CI  
**AC-Mapping & Notes By:** Executable QA (acceptance/E2E) + coder (unit/component)
**Consistency Audited By:** GLM 5.2 (PH6.1)  
**Final Verification Date:** YYYY-MM-DD  
**Repository Branch / Commit:** [feature/<slug> @ commit SHA]  
**Entry Point:** `tools/gauntlet.sh`  

## 1. AC/Spec → Test Mapping
Status: **pass / fail / unverified / n-a**. A row mapped to "skipped: <reason>" must carry unverified or n-a — never pass.

| AC ID / Scenario | Test | Status |
|---|---|---|
| US-001 AC-1 / [scenario] | [test file]::[test name] | pass |
| Must NOT: [negative constraint] | [test / layer / skipped: reason] | pass \| unverified |

## 2. Gauntlet Results (Automated Final Fresh Run)
*Numbers piped directly from mandatory fresh `./tools/run-gauntlet.sh logs/gauntlet-final.log` execution on the release candidate commit.*
- **Evaluated Candidate Commit SHA:** [git rev-parse HEAD]
- **Gauntlet Final Log SHA-256:** [64-hex SHA-256 recorded by the OEOS evidence tool]
- **SAST Scan Log SHA-256 (G11):** [64-hex SHA-256 recorded by the OEOS evidence tool]

| Layer | Command | Result (pasted numbers, not adjectives) |
|---|---|---|
| 1. Tests | npm test / pytest | [N] passed, 0 failed (baseline: [M] pre-existing, 0 new) |
| 2. Types | npx tsc --noEmit / mypy | 0 errors |
| 3. Lint | npm run lint / ruff | 0 warnings |
| 4. Changed-line coverage | coverage tool | [covered]/[total] changed lines ([%]) |
| 4b. Mutation testing | stryker / mutmut | [killed]/[total] killed ([%] kill rate) |
| 5. Supply chain & deps | npm audit / pip-audit | 0 Critical/High/Medium vulnerabilities |
| 6. Secret scanning | gitleaks detect | 0 secrets detected in branch range |

## 3. Coverage Exclusions (`gauntlet-exclude-next-line`)
*Document any lines excluded from 100% changed-line coverage (e.g. unreachable defensive guards marked with `// gauntlet-exclude-next-line: <reason>` or `# gauntlet-exclude-next-line: <reason>`).*

| File & Line | Code Snippet | Exclusion Reason | Reviewed at PH6? |
|-------------|--------------|------------------|-------------------|
| [src/file.ts:L45] | `throw new Error("Unreachable");` | Defensive type-narrowing guard | Yes / No |

## 4. Surviving Mutants & Equivalent Analysis
*Any mutant not killed by the test suite must be listed here with its technical justification.*

| Mutant ID | File & Line | Mutation Applied | Survival Reason / Equivalence Proof | Reviewed at PH6? |
|-----------|-------------|------------------|------------------------------------|-------------------|
| [M-01] | [src/file.ts:L22] | Changed `>` to `>=` | Equivalent: boundary value handled identically by upstream validator | Yes / No |

## 5. Independent Mutant & Exclusion Adjudication (Reviewed at G13)

Executable QA and an independent reviewer verify the sampled mutants and every exclusion. The human reviews their evidence, explicit limits, and working preview at G13; the human is not required to rerun tools or inspect detailed test cases.
| Item Evaluated | Human Decision (ACCEPTED / REJECTED) | Sign-Off Date | Human Rationale |
|----------------|--------------------------------------|---------------|-----------------|
| Surviving Mutants | ACCEPTED | YYYY-MM-DD | [Rationale] |
| Coverage Exclusions | ACCEPTED | YYYY-MM-DD | [Rationale] |

## 6. Skipped Layers & Quarantined Flakes
- **Skipped Layers:** [layer]: [justification] (or "None")
- **Quarantined Flakes:** [test]: [quarantine issue link] (must be resolved before release)

## 7. Acceptance & Regression Execution

| Journey / AC | Test owner | Candidate SHA | Command | Result | Structured result / trace SHA-256 |
|---|---|---|---|---|---|
| [critical user journey] | executable QA | [exact SHA] | [argv] | PASS / FAIL / NOT RUN | [path + hash] |

## 8. Browser / Device / Public-Interface Observations

| Platform and version | Real browser/device/emulator/public interface | Scenario | Observed outcome | Evidence path + SHA-256 |
|---|---|---|---|---|
| [Android API / browser / CLI / API] | [device ID, emulator image, browser version, or equivalent interface] | [journey] | PASS / FAIL / NOT RUN | [trace, screenshot, device log, or structured output] |

Every required interaction must have an observed PASS on the evaluated candidate. `NOT RUN`, missing evidence, an unavailable required device/environment, or a failed interaction blocks release.

## 9. Working Preview

- **Preview kind:** [deployed URL | local build | APK/app bundle | CLI/package artifact | other]
- **Candidate/artifact identity:** [candidate SHA + artifact SHA-256]
- **Launch/access instructions:** [exact steps]
- **Observed by executable QA:** [timestamp + result]
- **Known preview limitations:** [none or explicit list]

## 10. Untested Conditions & Explicit Limits

| Condition / limit | Reason | Release impact | Follow-up owner |
|---|---|---|---|
| [none, or exact untested condition] | [reason] | BLOCKING / non-blocking with independently reviewed rationale | [owner] |

## 11. Honest Notes
- [Failures encountered during implementation and how they were resolved; known limitations]
