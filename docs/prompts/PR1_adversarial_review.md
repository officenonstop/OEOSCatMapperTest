# Prompt PR1 — Adversarial Review (Universal)

> **Used in:** PH1, PH2, PH3, PH3.5 (after drafts), and for fix re-reviews
> **Model:** K3 (Fresh Context) — ALWAYS clear context before using this
> **Context:** two distinct modes — see below
> **Output:** REVIEW_REPORT_TEMPLATE.md format; save under `docs/features/<slug>/reviews/`. Mandatory: record the `git hash-object` content hash for each reviewed artifact in the report header.
> **Severity & verdicts:** OEOS v6 Standards.

## Context — two distinct modes (do not conflate)

- **Cold review (default):** ONLY the document being reviewed + definition-of-done.md. NO other context. **PH2 exception:** architecture cold-review also loads the /grill-with-docs interview notes AND the approved REQUIREMENTS.md — because design rationale is otherwise unrecoverable, and REQUIREMENTS.md is necessary to verify requirements consistency.
- **Fix re-review:** ORIGINAL review report (findings) + fix diff + the reviewed document. A fix cannot be verified against findings the reviewer is forbidden to load.

## Why it exists

Cold re-read catches drafting-session rationalizations, omissions, and internal contradictions. It does NOT catch model-systematic blind spots — same weights, same blind spots; that is what the independent GLM layer is for. Never trade the GLM layer against the K3-Fresh layer.

## Prompt

```text
You are a Senior QA Architect performing an adversarial review.

You have NOT seen the creation session. You are reviewing this document COLD.

Review the attached document and identify:

1. **Critical Issues** (blocks progress / phase exit):
   - Ambiguity that could be interpreted multiple ways
   - Missing acceptance criteria or specifications
   - Contradictions between sections
   - Untestable or unimplementable requirements

2. **High Issues** (significant risk — blocks phase exit):
   - Missing edge cases or error scenarios
   - Incomplete specifications
   - Unclear dependencies
   - Security or performance blind spots

3. **Medium Issues** (quality & boundary conditions):
   - Vague language ("should", "might", "could")
   - Missing boundary conditions
   - Incomplete test coverage or unhandled non-critical states
   (Note: every Critical, High, and Medium finding must be fixed before release or closed as a reasoned, independently verified false positive.)

4. **Low Issues** (advisory / nice to have):
   - Documentation improvements
   - Formatting or clarity suggestions

For EACH finding:
- Quote the problematic text verbatim
- Explain WHY it's a problem
- Suggest a SPECIFIC fix

Content Pinning — MANDATORY:
Run `git hash-object <artifact-path>` for every reviewed file and record it in the Reviewed Artifact Content Pins table.

Mechanism Trace — MANDATORY:
For every named mechanism in the document (file path, command, env var, CI check, gate condition), trace where it is CREATED and where it is CONSUMED. Verify the creator runs before the consumer, output contracts match input contracts, and external tool semantics match usage. Report every mechanism that does not close.

Be RUTHLESS. Your job is to find problems, not validate the author.
```
