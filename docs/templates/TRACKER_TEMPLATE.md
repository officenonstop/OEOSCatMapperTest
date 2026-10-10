USAGE INSTRUCTIONS:
- What this is: The single, authoritative operational tracker for one feature, change, or bug.
- Architecture: In OEOS v6, this tracker is the ONLY state file. It lives under `docs/features/<slug>/tracker.md` (or `docs/bugs/<slug>/tracker.md`) and IS committed to git.
- Execution model: The `oeos` orchestrator reads this file at startup and executes rows sequentially. Autonomous AI tasks run on an isolated `feature/<slug>` or `bug/<slug>` branch; the human is interrupted only for scope/design/test-strategy/release decisions (G1, G2, conditional G3, G5, G13, conditional G14, and BUG.2).
- Status vocabulary: PENDING · ACTIVE · DONE · BLOCKED · SKIP · SUPERSEDED.

# OEOS v6 Tracker

**Type:** FEATURE | CHANGE | BUG  
**Slug:** [kebab-case-name]  
**Status:** OPEN | BLOCKED | DONE | ABANDONED | SUPERSEDED (see <slug>)  
**Current Row:** [first row not DONE]  
**Branch:** feature/<slug> (or bug/<slug>)  
**Base Branch:** [main | <configured-base-branch>]  
**Base Commit SHA:** [SHA-1 of base at kickoff]  
**Created:** YYYY-MM-DD  **Updated:** YYYY-MM-DD  
**Model Waiver:** [None | <Nonempty reason for an eligible configured-model diversity exception; never runtime/unpinned/QA-GLM>]

---

## Prior Concerns & Triaged Mediums Carryover
<!-- Kickoff scans previous feature trackers and docs/reviews/opus-audit/ for open items. Record carried items here. -->
| Origin Slug / Audit | Finding ID | Severity | Description | Carried into Scope? | Resolution Note |
|---|---|---|---|---|---|
| [e.g. auth-v1] | M-02 | Medium | Token expiry clock skew boundary | Yes / No (Deferred) | Covered in Task T-03 |

---

## A. Feature / Change Lifecycle (Delete if Type=BUG)

| Row | Action | Actor | Gate | Status | Evidence / Artifact Path | Content Hash / Notes |
|-----|--------|-------|------|--------|--------------------------|----------------------|
| KICKOFF | Mint slug; create `docs/features/<slug>/reviews/`; create git branch `feature/<slug>`; initial doc commit | oeos + HUMAN | — | PENDING | docs/features/<slug>/ | branch created & committed |
| PH1.1 | Requirements interview with user (via `/grill-with-docs` skill or structured probing); notes saved to `interview-notes.md` | oeos + HUMAN | — | PENDING | docs/features/<slug>/interview-notes.md | |
| PH1.2 | Draft `requirements.md` from REQUIREMENTS_TEMPLATE | oeos-planner | — | PENDING | docs/features/<slug>/requirements.md | |
| PH1.3 | PR1 Cold adversarial review of `requirements.md` (content-hash pinned) | oeos-adversarial | — | PENDING | reviews/k3-adversarial-req.md | C/H/M counts: ___ |
| PH1.4 | Fix adversarial findings; re-verify fix diff (≤3 rounds) | oeos-planner + oeos-adversarial | — | PENDING | reviews/ | Round: 0/3 |
| PH1.5 | PR2 Independent review of `requirements.md` | oeos-glm-reviewer | — | PENDING | reviews/glm-independent-req.md | C/H/M counts: ___ |
| PH1.6 | Fix GLM findings; re-verify fix diff (≤3 rounds) | oeos-planner + oeos-glm-reviewer | — | PENDING | reviews/ | Round: 0/3 |
| PH1.7 | **G1 HUMAN GATE**: Review `requirements.md` + reports; approve; commit docs to branch | HUMAN | G1 | PENDING | Approvals Table | git commit G1 |
| PH2.1 | Draft `design.md` with strict Interface Contracts + ADRs to `docs/adr/` (query CodeGraph if existing modules touched) | oeos-planner | — | PENDING | docs/features/<slug>/design.md | ADRs written |
| PH2.2 | PR1 Semi-cold adversarial review of `design.md` (loads design + DoD + requirements.md + interview notes) | oeos-adversarial | — | PENDING | reviews/k3-adversarial-design.md | C/H/M counts: ___ |
| PH2.3 | Fix design findings; re-verify fix diff (≤3 rounds) | oeos-planner + oeos-adversarial | — | PENDING | reviews/ | Round: 0/3 |
| PH2.4 | PR3 Security & performance review of `design.md` | oeos-glm-reviewer | — | PENDING | reviews/glm-sec-perf-design.md | C/H/M counts: ___ |
| PH2.5 | Fix GLM design findings; re-verify fix diff (≤3 rounds) | oeos-planner + oeos-glm-reviewer | — | PENDING | reviews/ | Round: 0/3 |
| PH2.6 | **G2 HUMAN GATE**: Review `design.md` + ADRs + review reports; approve; commit docs | HUMAN | G2 | PENDING | Approvals Table | git commit G2 |
| PH2.7a| CONDITIONAL (UI): Adapt DESIGN.md tokens for target platform; write `docs/ui/design-decisions.md` | oeos-planner | — | PENDING | docs/ui/design-decisions.md | SKIP if non-UI |
| PH2.7b| CONDITIONAL: **G3 HUMAN GATE**: Visual approval of design system adaptation | HUMAN | G3 | PENDING | Approvals Table | SKIP if non-UI |
| PH3.1 | Decompose into small, testable tasks; record in Task Table below (propose Tiers 1/2/3) | oeos-planner | — | PENDING | Task Table below | Task list drafted |
| PH3.2 | Separate K3-Fresh/GLM task review; assign task tiers and file/resource ownership | oeos-adversarial + oeos-glm-reviewer | — | PENDING | reviews/task-reviews.md + Ownership Map | Agent review retained |
| PH3.4 | Independently qualify the executable QA model/session for every target class with realistic fixtures and require 100% mandatory checks | oeos-glm-reviewer + oeos-adversarial | — | PENDING | docs/testing/qa-qualification-<model>-<target>.md | Self-attestation/model reputation rejected |
| PH3.5a| Executable QA drafts human-facing `test-strategy.md` (outcomes, platforms, risk/tier decisions, preview, limits; no detailed cases) | oeos-test-planner | — | PENDING | docs/features/<slug>/test-strategy.md | QA draft |
| PH3.5b| Existing independent strategy reviews: K3-Fresh + GLM + coder feasibility | oeos-adversarial + oeos-glm-reviewer + oeos-coder | — | PENDING | reviews/test-strategy-reviews.md | Independent reviews |
| PH3.5c| Fix strategy findings; every finder re-verifies (shared ≤3 rounds) | oeos-test-planner + finders | — | PENDING | reviews/ | Round: 0/3 |
| PH3.5d| **G5 HUMAN GATE**: Approve test strategy, including task tiers/platforms/preview; commit docs | HUMAN | G5 | PENDING | Approvals Table | No detailed case/code review |
| PH3.6 | Greenfield: coder creates minimum runnable scaffold/test infrastructure. Brownfield: verify existing baseline. Coordinator proves build/launch/test-runner readiness | oeos-coder + oeos | — | PENDING | logs/scaffold-readiness.json | No business behavior |
| PH3.7 | QA drafts detailed `test-plan.md`, writes executable acceptance/E2E tests, observes meaningful RED, and receives GLM + K3-Fresh review | oeos-test-planner + oeos-glm-reviewer + oeos-adversarial | — | PENDING | test-plan.md + QA test paths + reviews/ | QA cannot self-approve |
| PH4.0 | **Two-Author Autonomous Task Loop**: coder authors unit/component RED and implementation; qualified QA authors/maintains acceptance/E2E and executes public-interface regression; reviewers assess both owners' tests; verify both approved-test sets immutable | oeos-coder + oeos-test-planner + reviewers | G6/G7 | PENDING | separate test commits/ledger rows + RED/GREEN/QA evidence | Runs autonomously |
| PH5.1 | **Automated Gauntlet Run**: Run `./tools/run-gauntlet.sh logs/gauntlet-ph5.log`; pipe raw exit codes and test logs | oeos (bash) | G7a | PENDING | logs/gauntlet-ph5.log | Automated run |
| PH5.2 | Compile preliminary `evidence.md` skeleton from Gauntlet logs and coverage evidence | oeos (bash) + oeos-coder | — | PENDING | docs/features/<slug>/evidence.md | Evidence skeleton |
| PH6.1 | PR4 Cross-artifact review (Requirements $\leftrightarrow$ Design $\leftrightarrow$ Code $\leftrightarrow$ Tests $\leftrightarrow$ Evidence) | oeos-glm-reviewer | — | PENDING | reviews/glm-cross-artifact.md | Independent review |
| PH6.2 | On-demand Ponytail audit (`/ponytail-review` on diff; minor items advisory) | oeos-glm-reviewer | G9 | PENDING | reviews/ponytail-review.md | Over-engineering check |
| PH6.3 | Diff standards & spec fidelity review | oeos-adversarial | G8 | PENDING | reviews/k3-diff-review.md | |
| PH7.1 | Fix loop for open findings: DeepSeek fixes $\rightarrow$ rerun Gauntlet $\rightarrow$ finders re-verify own findings (≤3 rounds) | oeos-coder + finders | G10 | PENDING | reviews/fix-reports.md | Round: 0/3 |
| PH7.4 | ESCALATION (if stuck >3 rounds): `/diagnosing-bugs` root cause $\rightarrow$ else Human decides scope/approach | oeos-coder + HUMAN | — | PENDING | reviews/diagnosis.md | SKIP unless stuck |
| PH8.1 | Application security scans (SAST via project toolchain `./tools/sast.sh`) | oeos (bash) | G11 | PENDING | logs/sast.log | 0 Critical/High/Medium |
| PH8.2 | Secret scanning and credential audit (`gitleaks detect --log-opts="$BASE_BRANCH..HEAD"`) | oeos (bash) | G12 | PENDING | logs/gitleaks.log | 0 secrets |
| PH8.3 | Sync upstream base; merge canon into `docs/architecture/*.md`; update ADRs/changelog; complete final reviews; commit all source/canon/reviews and freeze validated candidate SHA | oeos-planner + oeos-adversarial + oeos | — | PENDING | candidate SHA + docs/architecture/ | Any later non-evidence change restarts validation/review |
| PH8.4 | Run fresh Gauntlet and SAST on exact validated candidate; do not commit generated evidence yet | oeos (bash) | — | PENDING | structured receipts/logs | Exact candidate binding |
| PH8.5 | Agent-operated interaction/regression validation in each required browser/device/emulator or an explicitly applicable public-interface alternative; produce working preview | oeos-test-planner | — | PENDING | QA results + trace/device logs + preview | Missing/skipped/failed required run blocks |
| PH9.1 | CONDITIONAL MILESTONE (every 3–5 features or 4 weeks): before G13, assemble the pack on exact validated candidate and run Qwen/Opus-class audit | oeos-auditor | — | PENDING | docs/reviews/opus-audit/ | Blocking audit completes before release |
| PH9.2 | CONDITIONAL **G14 HUMAN GATE** before G13: approve only PASS with zero open Critical/High/Medium findings; keep audit evidence uncommitted until PH8.5b | HUMAN | G14 | PENDING | Approvals Table | Milestone audit closed pre-release |
| PH8.5b | Compile candidate-bound `evidence.md` and commit only allowed feature/audit evidence metadata; verify candidate contract | oeos | — | PENDING | evidence.md + candidate verification JSON | No production/test/control changes |
| PH8.6 | **G13 HUMAN GATE & RELEASE MERGE**: verify candidate/evidence-only descendant, review packet + preview, approve merge/push | HUMAN | G13 | PENDING | candidate identity + git log base | No post-approval upstream sync |

---

## B. Task Table (Populated at PH3.1, independently reviewed at PH3.2, approved as part of G5 strategy, executed at PH4.0)

| Task ID | Description | Tier | Coder unit/component tests | QA acceptance/regression tests | Source files | Status | Test commits/hashes | Impl commit |
|---------|-------------|------|----------------------------|--------------------------------|--------------|--------|---------------------|-------------|
| T-01 | [e.g. User schema validation] | Tier 2 | tests/unit/user.test.ts | tests/acceptance/user-flow.test.ts | src/user.ts | PENDING | [hashes/SHAs] | [SHA] |
| T-02 | [e.g. Password hashing service] | Tier 3 | tests/unit/auth.test.ts | tests/acceptance/auth-boundary.test.ts | src/auth.ts | PENDING | [hashes/SHAs] | [SHA] |

## B.1 Ownership and shared-resource map

| Path/resource | Owner | Required coordination/isolation |
|---|---|---|
| Production code and scaffold | oeos-coder | QA reports defects; independent review |
| Unit and implementation/component tests | oeos-coder | Existing tier review |
| Acceptance/E2E and user-journey regression tests | oeos-test-planner | GLM + K3-Fresh approval; coder cannot weaken |
| Shared fixtures, runner config, dependencies, lockfiles | [explicit owner] | Reviewed handoff; serialize conflicting edits |
| Snapshot/visual baselines | oeos-test-planner proposes | Independent review; no automatic replacement |
| Validation controls/release policy | protected control owner | Neither author changes controls to obtain green |
| Databases, ports, emulators/devices, external accounts | oeos coordinator | Isolate per run or enforce exclusive use and cleanup |

---

## C. Bug Lifecycle (Delete if Type=FEATURE/CHANGE)

| Row | Action | Actor | Gate | Status | Evidence Path | Notes |
|-----|--------|-------|------|--------|---------------|-------|
| BUG.0 | Confirm slug; create `docs/bugs/<slug>/`; checkout branch `bug/<slug>`; initial commit | oeos + HUMAN | — | PENDING | docs/bugs/<slug>/ | branch created & committed |
| BUG.1 | Root cause diagnosis via `/diagnosing-bugs` skill; write `report.md` (repro + scope classification) | oeos-coder | — | PENDING | docs/bugs/<slug>/report.md | |
| BUG.2 | **Scope Cap Decision**: If fix touches ≤3 files, no contract change, no new dep $\rightarrow$ proceed. If exceeds $\rightarrow$ convert to FEATURE tracker (mark this SUPERSEDED) | oeos + HUMAN | — | PENDING | docs/bugs/<slug>/report.md | Stop-and-wait gate |
| BUG.3 | Write meaningful RED regression test under the ownership map (QA for user journey/acceptance; coder for implementation-level); adversarial review; commit test | designated test owner + oeos-adversarial | — | PENDING | tests/ | Pre-fix RED and fixed GREEN observed |
| BUG.4 | Fix code only; verify test immutability (`git diff --quiet "$TEST_COMMIT" -- "${TEST_FILES[@]}"`); commit fix | oeos-coder | — | PENDING | src/ | Green verified & committed |
| BUG.5 | Adversarial review of regression test + fix diff by K3-Fresh | oeos-adversarial | — | PENDING | reviews/bug-review.md | C=0, H=0, M=0 required |
| BUG.6 | Run `./tools/run-gauntlet.sh logs/gauntlet-bug.log` automated validation | oeos (bash) | — | PENDING | logs/gauntlet-bug.log | Gauntlet green |
| BUG.7 | Generate `docs/bugs/<slug>/evidence.md` with final fresh numbers; commit docs | oeos-coder + oeos | — | PENDING | docs/bugs/<slug>/evidence.md | Evidence sealed |
| BUG.8 | **HUMAN REVIEW & MERGE**: Review diff and evidence; merge `bug/<slug>` to base branch; push | HUMAN | G13 | PENDING | git log base | Bug Merged & Pushed |

---

## Approvals Table (Major Human Gates)

| Gate | Row | Date | Decision (APPROVED / SENT BACK) | Blocking findings (must be zero to approve) | Human Notes |
|------|-----|------|---------------------------------|--------------------------------------------|-------------|
| G1 | PH1.7 | | | | |
| G2 | PH2.6 | | | | |
| G3 | PH2.7b| | | | |
| G5 | PH3.5d| | | | Strategy, tiers, platforms, and preview approved |
| G13 | PH8.6 | | | | Release Merge |
| G14 | PH9.2 | | | | Milestone Closed |

---

## Append-Only Progress Log
<!-- oeos orchestrator appends timestamped one-line log entries here after each row completes -->
