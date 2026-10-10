USAGE INSTRUCTIONS:
- When to use: Use this template to define the system architecture, component design, and API contracts for a feature.
- How to use: Copy this file to `docs/features/<slug>/design.md` (the feature's design delta — Handbook §6), remove this instruction block, and fill in the bracketed fields. Link to any relevant ADRs.
# Architecture: [Feature/Component Name]

**Version:** 1.0  
**Status:** Draft | Approved  
**Author:** [Architect model — see Handbook §4 matrix]  
**Date:** YYYY-MM-DD

## 1. System Context (C4 Level 1)
[Describe the system and its interactions with external systems/users]

### External Systems
| System | Purpose | Protocol | Notes |
|--------|---------|----------|-------|
| [Name] | [What it does] | REST/gRPC/etc. | [Important details] |

## 2. Container Diagram (C4 Level 2)
[Describe all containers (applications, databases, etc.) and their interactions]

### Containers
| Container | Technology | Purpose | Communication |
|-----------|-----------|---------|---------------|
| [Name] | [Tech stack] | [Responsibility] | [How it talks to others] |

## 3. Component Design

### 3.1 [Component Name]
- Responsibility: [Single responsibility]
- Key interfaces: [Public API/methods]
- Dependencies: [What it depends on]
- Data flow: [Input → Processing → Output]

### 3.5 Interface Contracts (MANDATORY — PH4's sole coding blueprint)

> PH4 test writers and coders rely on these contracts alone. Be exact: any behavior not specified here is unspecified. PH2 exit is conditional on this section being complete for every component (Handbook §7 PH2).

### Contract: [Component.Method / Endpoint]
- **Exact signature:** `ClassName.methodName(param: Type, ...) -> ReturnType` (or HTTP: `POST /api/x`)
- **Parameters:** [name — type — constraints / allowed values]
- **Preconditions:** [what must be true when called]
- **Postconditions:** [what is guaranteed after return]
- **Error cases:** [condition → exception / error code / behavior]
- **Idempotency & side effects:** [safe to retry? what mutates?]
- **Invariants:** [what must never be true]

*(Repeat for every public interface the feature touches.)*

## 4. Database Design

### Tables
| Table | Purpose | Key Columns | Relationships |
|-------|---------|-------------|---------------|
| [Name] | [What it stores] | [Important columns] | [FK relationships] |

### Indexes
| Table | Index | Columns | Rationale |
|-------|-------|---------|----------|

## 5. API Design

### Endpoints
| Method | Path | Purpose | Request | Response |
|--------|------|---------|---------|----------|
| [GET/POST/etc.] | [/api/...] | [What it does] | [Schema ref] | [Schema ref] |

## 6. Security Considerations
- Authentication: [Approach]
- Authorization: [Approach]
- Data protection: [Encryption, PII handling]
- Input validation: [Strategy]

## 7. Error Handling
- Error response format
- Retry strategy
- Circuit breaker patterns (if applicable)

## 8. Technology Decisions
[Reference ADRs for each major decision]
