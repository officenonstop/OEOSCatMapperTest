USAGE INSTRUCTIONS:
- When to use: PH3.5, before executable cases are authored.
- Human scope: approve coverage intent, target platforms, risk/tier decisions, interaction approach, preview plan, and explicit limits at G5. Detailed cases and test code remain agent-owned.
- How to use: Copy to `docs/features/<slug>/test-strategy.md`, remove this block, and replace every placeholder.

# Feature Test Strategy: [Feature Name]

**Status:** Draft | Under Review | Approved  
**Author:** oeos-test-planner  
**Independent Reviewers:** oeos-glm-reviewer, oeos-adversarial, oeos-coder (feasibility only)  
**Human Strategy Approval:** [name/date at G5]  
**Approved Content Hash:** [git hash-object]

## 1. Scope and observable outcomes

[User-visible outcomes, public contracts, and excluded scope. Do not list detailed test steps.]

**G5 freeze boundary:** [List the approved behavioral expectations and necessary public contracts that become stable inputs for scaffold and QA work. Explicitly exclude incidental internal function names, CSS/DOM structure, and speculative future modules.]

## 2. Components, platforms, and execution environments

| Component | Platform/toolchain | Required validation levels | Interaction environment | Release artifact/preview |
|---|---|---|---|---|
| [id] | [web/Android/JVM/Python/Rust/etc.] | [unit/integration/acceptance/security] | [browser/emulator/device/CLI/API] | [URL/APK/command/build] |

## 3. Risk, task tier, and detection strategy

| Task/risk | Tier | Failure impact | Independent detection layers | Required evidence |
|---|---:|---|---|---|
| [task] | [1/2/3] | [impact] | [coder tests + QA acceptance + reviewer/scanner] | [artifact] |

## 4. Acceptance and regression approach

[High-level user journeys, important boundaries, persistence/lifecycle/offline/authorization behavior, and regression scope. Detailed cases belong in `test-plan.md` after G5.]

## 5. Test data, isolation, and shared resources

[Fixtures, databases, ports, devices/emulators, accounts, cleanup, ownership, and serialization rules.]

## 6. Working preview and release evidence

[How the owner will access the working preview and what browser/device/API/CLI evidence agents will provide at G13.]

## 7. Known limits

[Explicitly untested conditions. A missing required capability blocks release; cost is not a waiver.]
