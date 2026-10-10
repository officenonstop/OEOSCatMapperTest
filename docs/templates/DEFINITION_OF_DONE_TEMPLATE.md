USAGE INSTRUCTIONS:
- When to use: PH0 (Project Setup).
- How to use: Copy this file to `docs/definition-of-done.md`, remove this instruction block, and customize any project-specific thresholds.
- Purpose: Establishes the non-negotiable exit criteria for every feature, change, and bug fix in the repository.

# Definition of Done (DoD)

This document defines the mandatory, objective criteria that any code or feature must satisfy before being merged to `main` in this repository under OEOS v6.

---

## 1. Specification & Contract Fidelity
- [ ] **Acceptance Criteria:** Every Acceptance Criterion in `requirements.md` is covered by at least one explicit automated test.
- [ ] **Interface Contracts:** All public functions, classes, API endpoints, and database models match the signatures, parameter constraints, error codes, and invariants defined in `design.md` §3.5.
- [ ] **Negative Constraints:** Explicit "Must NOT" constraints specified during requirements and architecture are verified with negative tests.

---

## 2. Automated Validation (The Gauntlet)
The validation script `./tools/gauntlet.sh` must execute cleanly and exit with code `0`. All numbers must be captured directly from this run into `evidence.md`:
- [ ] **Tests:** Full test suite passes. Zero new test failures compared to baseline.
- [ ] **Types:** Typechecker (`tsc --noEmit`, `mypy`, or language equivalent) completes with 0 errors.
- [ ] **Linter:** Project linter passes with 0 warnings or errors.
- [ ] **Changed-Line Coverage:** 100% test coverage on all modified/added lines, OR any uncovered lines carry an explicit `// gauntlet-exclude-next-line: <concrete reason>` comment (or `#` for Python) on the immediately preceding line documented in `evidence.md`.
- [ ] **Mutation Testing:** Zero unconvincing mutant survivals on modified lines. All surviving mutants are documented with equivalence proofs in `evidence.md`.
- [ ] **Security Scans:** `gitleaks` passes with 0 secrets detected; SAST and dependency audit report 0 Critical, High, or Medium vulnerabilities.
- [ ] **Components/Platforms:** Every detected build root is mapped to an executable adapter. Build, test, static/lint, security, interaction, coverage/mutation, and release-artifact evidence pass on required browsers/devices/emulators or public interfaces.

---

## 3. Multi-Model Review & Integrity
- [ ] **Content Pins:** Review reports in `reviews/` record the 40-character `git hash-object` SHA-1 for every reviewed artifact.
- [ ] **Quality Exit Bars:**
  - **Critical Findings:** 0 open.
  - **High Findings:** 0 open.
  - **Medium Findings:** 0 open. A demonstrated false positive may be closed only with a reasoned disposition and independent verification; a real defect cannot be waived, deferred, or relabeled as baseline.
- [ ] **Test Immutability:** Approved test file hashes match disk contents. Implementation commits did not alter test assertions to achieve green status.

---

## 4. Documentation & Repository Canon
- [ ] **Canon Merge:** Architectural changes in `design.md` and ADRs in `docs/adr/` are merged into the repository canon (`docs/architecture/*.md`).
- [ ] **Changelog:** `CHANGELOG.md` is updated with all user-facing additions, fixes, or breaking changes.
- [ ] **Repository Card:** `AGENTS.md` is updated if new build/test commands or architectural conventions were introduced.

---

## 5. Human Sign-Off (Gates)
- [ ] **Gate G1 (Requirements):** Approved by Product Owner.
- [ ] **Gate G2 (Architecture):** Approved by Product Owner.
- [ ] **Gate G5 (Test Strategy):** Product Owner approved outcomes, target platforms, risk/tier decisions, preview plan, and known limits; detailed cases remain agent-owned.
- [ ] **Gate G13 (Release Merge):** Final diff and `evidence.md` approved; merged to `main` via `git merge --no-ff`.
