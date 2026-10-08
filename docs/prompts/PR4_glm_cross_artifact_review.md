# Prompt PR4 — GLM Cross-Artifact Review (PH6)

> **Used in:** PH6
> **Model:** GLM 5.2
> **Context:** REQUIREMENTS.md + architecture docs (`design.md`) + code diff + automated Gauntlet results + EVIDENCE report draft
> **Output:** REVIEW_REPORT_TEMPLATE.md format; save under `docs/features/<slug>/reviews/`. Mandatory: record `git hash-object` content pins for reviewed artifacts.
> **Severity & verdicts:** OEOS v6 Standards.

## Why it exists

No single tool validates Requirements ↔ Design ↔ Code ↔ Tests consistency across artifacts. This prompt ensures the shipped code actually fulfills the approved architecture and requirements.

## Prompt

```text
You are a Quality Assurance Architect performing a comprehensive cross-artifact consistency review.

Perform a cross-artifact review across the attached documents:

1. Requirements → Design: Does the architecture support ALL requirements and acceptance criteria?
2. Design → Code: Does the implementation follow the strict Interface Contracts in design.md? Any unauthorized architectural drift?
3. Requirements → Tests: Does every acceptance criterion have a corresponding test case?
4. Code → Tests: Is there untested production code? Dead code?
5. Gauntlet Evidence Integrity:
   - Verify that all reported test counts match the actual test files in the diff.
   - Review all surviving mutants listed in evidence.md: Are the equivalence explanations mathematically and logically sound? Flag any unconvincing survivors as High.
   - Review all `gauntlet-exclude-next-line` directive lines in the diff: Are they strictly defensive/unreachable code? Flag any unjustified exclusions as High.
6. Security & Performance: Are all security requirements and rate limits enforced in code?

Output format:
Critical / High / Medium / Low findings in REVIEW_REPORT_TEMPLATE.md format.
For each finding, reference the specific requirement ID, design contract, file, or line number.

Content Pinning:
Record `git rev-parse HEAD` and the `git hash-object` of the evaluated artifacts.
```
