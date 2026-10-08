USAGE INSTRUCTIONS:
- When to use: Use this template for AI-driven adversarial, independent, or cross-artifact reviews of documents or code.
- How to use: Create a new report in the feature's `reviews/` folder, remove this instruction block, and log all findings systematically.
- Content Pinning: For uncommitted drafts (PH1–PH3.5), record the exact `git hash-object <path>` for each reviewed artifact. Never leave the Content Pins table empty.

# Review Report

**Document Reviewed:** [Document name and path]  
**Reviewer:** [Model name / Agent Role]  
**Reviewed Commit:** [full 40-character git rev-parse HEAD]
**Verdict:** PASS | PASS WITH CONCERNS | FAIL
**Critical Findings:** 0
**High Findings:** 0
**Medium Findings:** 0
**Low Findings:** 0
**Review Type:** Adversarial | Independent | Cross-Artifact | Audit  
**Date:** YYYY-MM-DD  
**Repository HEAD:** [git rev-parse HEAD]  
**Overall Assessment:** PASS | PASS WITH CONCERNS | FAIL

## Reviewed Artifact Content Pins (Mandatory)
| Artifact Path | Content Hash (`git hash-object`) |
|---------------|----------------------------------|
| [path/to/artifact.md] | [40-char SHA-1 hash] |

## Critical Findings (Blocks Phase Exit)
| ID | Section | Finding | Quote | Suggested Fix |
|----|---------|---------|-------|---------------|
| C-01 | [Section] | [What's wrong] | "[Exact quote]" | [Specific fix] |

## High Findings (Significant Risk — Blocks Phase Exit)
| ID | Section | Finding | Quote | Suggested Fix |
|----|---------|---------|-------|---------------|
| H-01 | [Section] | [What's wrong] | "[Exact quote]" | [Specific fix] |

## Medium Findings (Quality / Boundary Cases)
| ID | Section | Finding | Quote | Suggested Fix | Disposition |
|----|---------|---------|-------|---------------|-------------|
| M-01 | [Section] | [What's wrong] | "[Exact quote]" | [Specific fix] | Fixed in Phase / Triaged (Human Signed: Gate Gx) |

## Low Findings (Advisory / Documentation Improvements)
| ID | Section | Finding | Suggestion |
|----|---------|---------|------------|
| L-01 | [Section] | [What could improve] | [Suggestion] |

## Fix Verification (Closure)
| Finding ID | Fix Round | Fixed By | Re-reviewed By | Verdict | Notes |
|------------|-----------|----------|----------------|---------|-------|
| C-01 | 1 | [model] | [model] | Resolved / Open | [Specific fix verified] |

## Summary
- **Critical:** [count] (must be 0 to exit)
- **High:** [count] (must be 0 to exit)
- **Medium:** [count] (all must be fixed or independently verified as false positives)
- **Low:** [count]
- **Verdict Mapping:**
  - **PASS:** Critical=0 AND High=0 AND Medium=0
  - **PASS WITH CONCERNS:** Critical=0 AND High=0, but Medium findings remain open. This is an intermediate blocking verdict and cannot authorize release.
  - **FAIL:** Any Critical or High finding open
- **Recommendation:** [Approve / Revise and Re-review / Escalate to Human]
