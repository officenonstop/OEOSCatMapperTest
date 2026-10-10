USAGE INSTRUCTIONS:
- Complete once per QA model/version and supported target class before unattended acceptance work.
- Independent reviewer owns the evaluation oracle and adjudication. A few examples qualify only the represented class.

# Executable QA Qualification

**QA Model ID:** [provider/model]  
**Model Family:** [family]  
**Target Class:** [web | native-android | JVM | Python | Rust | other]  
**Toolchain/Versions:** [exact versions]  
**Known-Correct Fixture SHA:** [commit]  
**Known-Defect Fixture SHA:** [commit]  
**Independent Adjudicator:** [agent/model]  
**Verdict:** QUALIFIED | NOT QUALIFIED
**Fallback Candidate (required when NOT QUALIFIED):** [provider/model | none available — BLOCKED]
**Diversity Result:** [different from coder and GLM | QA/coder same-family tracker waiver + reason; QA/GLM collision prohibited]

| Requirement | Command/evidence | Correct fixture | Defect fixture | Intended reason verified? |
|---|---|---|---|---|
| Tests compile and execute | [path/hash] | PASS | [executed] | Yes/No |
| Meaningful behavioral discrimination | [path/hash] | PASS | FAIL | Yes/No |
| Clean isolated repeatability | [runs/traces] | PASS | FAIL | Yes/No |
| Interaction/device operation where applicable | [trace/device log] | PASS | FAIL | Yes/No/N/A |
| Cleanup and no production/control mutation | [state comparison] | PASS | PASS | Yes/No |

Any flake, environment-only RED, copied implementation assumption, hidden retry, weakened environment, or sole-author oracle yields NOT QUALIFIED. If this model fails, preserve this failed result and independently qualify a more capable candidate even at higher cost. Prefer a family different from the production coder. Never auto-switch QA to the coder; a QA/coder same-family candidate requires an explicit tracker diversity waiver and must still pass every qualification row. QA/GLM identity or family collisions are non-waivable. If no candidate qualifies, record BLOCKED and do not assign unattended acceptance work.
