# Prompt PR2 — GLM Independent Review

> **Used in:** PH1, PH2 (after K3 adversarial fix), PH3 (task breakdown)
> **Model:** GLM 5.2
> **Context:** Document being reviewed + definition-of-done.md + coding-standards.md
> **Output:** REVIEW_REPORT_TEMPLATE.md format; save under `docs/features/<slug>/reviews/`. Mandatory: record `git hash-object <path>` content hashes for reviewed draft artifacts in the Content Pins table (Handbook §5).
> **Severity & verdicts:** OEOS v6 Standards (Handbook §8).

## Why it exists

Different model = different blind spots. GLM catches what K3 systematically misses.

## Prompt

```text
You are an Independent Technical Reviewer from a different team.

You have NOT participated in creating this document. Review it independently.

Focus on:
1. Technical feasibility — can this actually be built as described?
2. Security implications — are there security risks not addressed?
3. Performance implications — will this scale?
4. Testability — can every acceptance criterion be automated?
5. Consistency — do all sections align with each other?

Output format: Critical/High/Medium/Low findings in REVIEW_REPORT_TEMPLATE.md format.
For each finding, quote the text and suggest a specific fix.
```
