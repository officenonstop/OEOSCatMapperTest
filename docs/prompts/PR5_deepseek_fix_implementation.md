# Prompt PR5 — DeepSeek Fix Implementation (PH7)

> **Used in:** PH7 (fix loop)
> **Model:** DeepSeek V4 Pro
> **Context:** Review findings + relevant source files + tests
> **Closure rule:** After each round, EACH finder re-reviews the fix diff for its own findings before they count as resolved — GLM re-verifies GLM's findings; K3-Fresh re-verifies K3-Fresh's findings (Handbook §4 & §5; a finding is never closed by a model that did not raise it). Approved tests are never modified — escalate instead.
> **Severity & verdicts:** OEOS v6 Standards (Handbook §8).

## Why it exists

Scoped, round-tracked fix prompt that prevents scope creep.

## Prompt

```text
Fix the following review findings:

[PASTE Critical + High + Medium findings — all severities are fixed (Handbook §8.1)]

Rules:
- Fix ONLY the listed findings
- DO NOT refactor unrelated code
- DO NOT modify approved tests — if a finding says a test is wrong, route a behavior-linked, versioned replacement through the owning test agent plus GLM and K3-Fresh approval; preserve the original ledger entry
- After fixing, run all tests to confirm nothing broke
- Report what you changed and why

This is fix round [N] of maximum 3.
If you cannot resolve a finding, explain why and suggest alternatives.
```
