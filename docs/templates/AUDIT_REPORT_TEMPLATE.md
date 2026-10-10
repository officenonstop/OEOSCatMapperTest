USAGE INSTRUCTIONS:
- When to use: Use this template exclusively for Claude Opus 5 milestone audits (PH9, Tier A or Tier B).
- How to use: Save in docs/reviews/opus-audit/ at the end of a milestone, remove this instruction block, and perform a comprehensive review of the changes.
- Evidence rule: for EVERY checkbox marked, record evidence (file path, test ID, commit, or report reference). A checked box without evidence is a rubber stamp.
# Milestone Audit Report

**Milestone:** [Name/Version]  
**Auditor:** [Final-Auditor model — see Handbook §4 matrix]  
**Audit Tier:** Tier A (milestone: summaries + ADRs + diff) | Tier B (pre-release: + full docs + full code)  
**Date:** YYYY-MM-DD  
**Boundary From SHA:** [fromSha]  
**Boundary To SHA:** [toSha]  
**Pack Manifest SHA-256:** [packManifestSha256]  
**Changes Since Last Audit:** [Git diff summary — files changed, lines added/removed]

## Overall Assessment
**Verdict:** PASS | PASS WITH CONCERNS | FAIL
**Critical Findings:** 0
**High Findings:** 0
**Medium Findings:** 0
**Low Findings:** 0

[2-3 sentence executive summary]

## Architectural Integrity
- [ ] Changes align with stated architecture
- [ ] No unauthorized architectural deviations
- [ ] ADRs are being followed

[Details if any concerns]

## Security Posture
- [ ] No new attack surfaces introduced
- [ ] Authentication/authorization properly implemented
- [ ] Input validation in place
- [ ] No secrets in code

[Details if any concerns]

## Code Quality
- [ ] No critical code smells
- [ ] Error handling is consistent
- [ ] No obvious performance issues

[Details if any concerns]

## Test Coverage
- [ ] Critical paths have tests
- [ ] Edge cases covered
- [ ] Tests are meaningful (not trivial)

[Details if any concerns]

## Technical Debt
| Item | Severity | Recommended Action | Priority |
|------|----------|-------------------|----------|
| [Issue] | High/Med/Low | [What to do] | [When] |

## FAIL Finding Resolution (re-audit only)
*Required when this audit follows a FAIL: every FAIL finding from the prior audit must appear here.*
| Finding ID | PH7 Resolution (what fixed it) | Re-audit Verdict | Date |
|------------|-------------------------------|------------------|------|
| [F-01] | [Fix description + commit] | Resolved / Open | YYYY-MM-DD |

## PASS WITH CONCERNS Dispositions (if applicable)
*Every concern is a blocking Medium finding that must be fixed before release (or closed as an independently verified false positive) — no deferral past release and no Charter-Exception ADR for defects. Strict row schema enforced by verify-audit-report.sh: registration requires Concern, Disposition, Owner and ISO Fixed-By date; G14 additionally requires exact PASS with zero open Critical/High/Medium. Prose dispositions, missing/extra fields, duplicates, invalid dates and template rows are rejected.*
| Concern | Disposition | Owner | Fixed By (date) | Human Initials |
|---------|-------------|-------|-----------------|----------------|
| [Concern] | Fix (before next release) | [Owner] | [YYYY-MM-DD] | [Initials at G14] |

## Recommendations
1. [Actionable recommendation]
2. [Actionable recommendation]
