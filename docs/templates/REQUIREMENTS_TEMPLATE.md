USAGE INSTRUCTIONS:
- When to use: Use this template to define the functional and non-functional requirements for a new feature or project.
- How to use: Copy this file to `docs/features/<slug>/requirements.md` (one feature folder per feature — Handbook §6), remove this instruction block, and fill in the bracketed fields.
# Requirements: [Feature Name]

**Version:** 1.0  
**Status:** Draft | Under Review | Approved  
**Author:** [Planner model — see Handbook §4 matrix]  
**Reviewed By:** [Adversarial model], [Independent model], [Human Name]  
**Date:** YYYY-MM-DD

## 1. Overview
[Brief description of what this feature does and why it's needed]

## 2. User Stories

### US-001: [Story Title]
**As a** [role]  
**I want** [action]  
**So that** [benefit]  

**Acceptance Criteria:**
- [ ] Given [context], When [action], Then [expected result]
- [ ] Given [context], When [action], Then [expected result]

### US-002: [Story Title]
...

## 3. Non-Functional Requirements

### 3.1 Performance
- [Specific, measurable performance targets]

### 3.2 Security
- [Authentication, authorization, data protection requirements]

### 3.3 Scalability
- [Expected load, growth expectations]

### 3.4 Accessibility
- [WCAG level, screen reader support, etc.]

## 4. Out of Scope
- [Explicitly list what this feature does NOT include]

## 5. Dependencies
| Dependency | Type | Status |
|-----------|------|--------|
| [Feature/API/System] | Internal/External | Available/In Progress/Blocked |

## 6. Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| [Risk description] | High/Med/Low | High/Med/Low | [Strategy] |

## 7. Open Questions
- [ ] [Question needing stakeholder input]

## 8. Review History
| Date | Reviewer | Model | Findings | Resolution |
|------|----------|-------|----------|------------|
| | K3 Adversarial | K3 | [Summary] | [How resolved] |
| | GLM Review | GLM 5.2 | [Summary] | [How resolved] |
| | Human | - | [Summary] | [How resolved] |

## 9. AC Traceability (completed in PH3.7 after G5 strategy approval)
| Acceptance Criterion | Test Plan Case IDs | Status |
|----------------------|--------------------|--------|
| US-001 AC-1 | [UT/IT/E2E IDs] | Planned / Covered |

> Every acceptance criterion above must appear in the PH3.7 detailed test-plan traceability matrix. G5 approves the feature strategy, not detailed cases.
