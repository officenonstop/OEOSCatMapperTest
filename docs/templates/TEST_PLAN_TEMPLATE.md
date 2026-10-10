USAGE INSTRUCTIONS:
- When to use: PH3.7, after G5 strategy approval and scaffold readiness. Defines agent-owned detailed cases and executable acceptance coverage.
- Review Process: Authored by executable QA (`oeos-test-planner`). Reviewed independently by GLM and K3-Fresh; the coder may comment on feasibility but cannot approve or weaken acceptance expectations. The human does not review detailed cases.
- How to use: Copy this file to `docs/features/<slug>/test-plan.md`, remove this instruction block, and fill in the bracketed fields.

# Test Plan: [Feature Name]

**Version:** 1.0  
**Status:** Draft | Under Review | Approved  
**Author:** [QA model / oeos-test-planner]
**Independent Reviewer:** [GLM 5.2]  
**Adversarial Reviewer:** [K3-Fresh]  
**Implementability Reviewer:** [DeepSeek V4 Pro]  
**Approval Authority:** [independent agent reviewers; no human case review]
**Date:** YYYY-MM-DD  
**Independently Reviewed Test Plan Hash (`git hash-object`):** [SHA-1 after GLM + K3-Fresh approval]

> This plan implements the G5-approved feature test strategy. Its executable acceptance tests are content-hashed; amendments require a behavior-linked reason, versioned change, independent approval, and fresh affected verification.

## 1. Scope
[What is being tested and what is NOT being tested]

## 2. Test Strategy
| Level | Framework | Coverage Target | Responsibility |
|-------|-----------|----------------|----------------|
| Unit | [Jest/pytest/etc.] | Changed-line 100% (excl. justified) | Coder writes; existing tier review applies |
| Implementation/component integration | [Framework] | Internal contracts and boundaries | Coder writes; existing tier review applies |
| Acceptance/E2E | [platform-native framework] | User journeys + critical errors | QA writes and executes; GLM + K3-Fresh review |

## 3. Test Cases

### Unit Tests
| ID | User Story | Description | Input | Expected Output | Priority |
|----|-----------|-------------|-------|-----------------|----------|
| UT-001 | US-001 | [What it tests] | [Input data] | [Expected result] | Critical/High/Medium |

### Integration Tests
| ID | Components | Description | Preconditions | Expected Behavior |
|----|-----------|-------------|---------------|-------------------|
| IT-001 | [A → B] | [What it tests] | [Setup needed] | [Expected result] |

### Acceptance/E2E Tests (platform appropriate)
| ID | User Flow | Steps | Expected Result |
|----|-----------|-------|----------------|
| E2E-001 | [Flow name] | [Step-by-step] | [What user sees] |

## 4. Edge Cases
| Scenario | Input | Expected Behavior |
|----------|-------|-------------------|
| Empty input | [null/empty/undefined] | [Error message/default behavior] |
| Boundary value | [Max/min values] | [Expected result] |
| Concurrent access | [Multiple users/threads] | [Expected behavior] |

## 5. Non-Functional Tests
| Requirement | Test | Threshold | Tool |
|------------|------|-----------|------|
| Response time | API latency | <200ms p95 | [Tool] |
| Security | [Specific test] | [Pass criteria] | [Tool] |

## 6. Traceability Matrix (Every AC must appear)
| Acceptance Criterion | Test Case IDs | Covered? |
|----------------------|---------------|----------|
| US-001 AC-1 | UT-001, IT-002 | Yes |
| [Every AC from REQUIREMENTS.md] | [IDs] | Yes/No |

> PH3.7 exit requires every acceptance criterion traced to at least one reviewed test case. PH3.5/G5 approves only the higher-level feature test strategy.

## 7. Failure Model (Tier 3 only — high-stakes: money, auth, data loss, concurrency, public API)
*The ways this specific change can hurt, each mapped to a layer that can actually catch it. Mutation and coverage cannot substitute for mode-targeted layers. Failure modes deliberately not covered are recorded as known limits.*

| Failure Mode | Detection Layer | Test/Layer ID | Covered? |
|--------------|-----------------|---------------|----------|
| [e.g., race condition on concurrent writes] | [race/stress test] | [CT-001] | Yes/No |
| [e.g., partial write on crash] | [rollback rehearsal] | [RB-001] | Yes/No |
| [deliberately not covered: mode] | — | — | Known limit — reason: [why] |

## 8. Dual Review & Implementability Sign-Off
- **K3-Fresh Adversarial Review:** [PASS / FAIL] (Review report: `reviews/k3-adversarial-testplan.md`)
- **DeepSeek Implementability Review:** [PASS / FAIL] (Confirms contracts are testable and mock boundaries clear)
- **GLM QA-Test Review:** [PASS / FAIL]
- **K3-Fresh Conformance Review:** [PASS / FAIL]
