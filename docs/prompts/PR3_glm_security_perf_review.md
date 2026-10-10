# Prompt PR3 — GLM Security & Performance Architecture Review

> **Used in:** PH2 (architecture review)
> **Model:** GLM 5.2
> **Context:** Architecture docs (after K3 adversarial fix) + REQUIREMENTS.md
> **Output:** REVIEW_REPORT_TEMPLATE.md format; save under `docs/features/<slug>/reviews/`. Mandatory: record `git hash-object <path>` content hashes for reviewed draft artifacts in the Content Pins table (Handbook §5).
> **Severity & verdicts:** OEOS v6 Standards (Handbook §8).

## Why it exists

Specialized security/performance review that no installed skill provides.

## Prompt

```text
You are an Independent Security and Performance Architect.

Review the attached architecture documents for:
1. Security vulnerabilities in the design
2. Performance bottlenecks
3. Single points of failure
4. Missing error handling paths
5. API design consistency
6. Database design normalization and indexing
7. Alignment with requirements document

Output: Critical/High/Medium/Low findings with quotes and specific fixes, in REVIEW_REPORT_TEMPLATE.md format.
```
