---
name: create-plan
description: >
  Create a concise, actionable plan for coding tasks. Use when the user explicitly
  asks for a plan, needs to break down a complex task, or wants to see a roadmap
  before implementation. Operates in read-only mode with minimal questions and
  structured output. Uses repository context (docs, code, tests, and version
  control status) for informed planning.
---

# Create Plan

## Goal

Turn a user prompt into a **single, actionable plan** delivered in the final assistant message. Plans are concise, scoped, and ready for execution.

## When to Use

- User explicitly asks for a plan ("create a plan", "what's the approach", "break this down")
- Complex task requiring structured breakdown before implementation
- User wants to review scope before proceeding
- Multi-step feature or refactoring that benefits from roadmap

**Do not use** for:
- Simple, single-step tasks ("fix this typo", "add a comment")
- When user wants immediate implementation without planning
- Trivial requests that don't benefit from structured breakdown

## Workflow

**Throughout the entire workflow, operate in read-only mode. Do not write or update files.**

### 1. Gather Context Quickly

Use repository and workspace context:

**Context Signals** (if available):
- Open or recently viewed files (likely area of change)
- Current working tree status (branch, uncommitted changes)

**Active Context Gathering**:
- Read `README.md` if present
- Scan obvious docs: `docs/`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `DESIGN.md`
- Skim relevant files (the ones most likely to be touched)
- Check `package.json` / `requirements.txt` / `Cargo.toml` for tech stack
- Check lint/test output for existing issues that should be acknowledged
- Check version control status for branch name and staged changes (context for scope)

**Identify Constraints**:
- Language and frameworks in use
- Test commands (npm test, pytest, cargo test)
- CI/CD setup (GitHub Actions, etc.)
- Deployment shape (monolith, microservices, serverless)
- Coding standards or conventions (linter configs, style guides)

### 2. Ask Follow-Up Questions (If Blocking)

- Ask **at most 1–2 questions**
- Only ask if you **cannot responsibly plan** without the answer
- Prefer multiple-choice questions when possible
- If unsure but not blocked, **make a reasonable assumption** and proceed
- State assumptions clearly in the plan

**Good reasons to ask**:
- User's intent is ambiguous ("auth" could mean many things)
- Critical technical constraint unknown (database choice, API version)
- Scope boundary unclear (MVP vs. full feature)

**Bad reasons to ask**:
- Minor implementation details you can infer
- Preferences that don't affect the plan structure
- Information easily found in codebase or docs

### 3. Create the Plan

Use the template below exactly. Key principles:

**Structure**:
- Start with **1 short paragraph** (1-3 sentences): what, why, and high-level approach
- Clearly call out **scope**: what's **in** and what's **out**
- Provide **6–10 action items** (small checklist)
- Include **open questions** (max 3) if there are unknowns

**Action Items**:
- **Atomic and ordered**: discovery → changes → tests → rollout
- **Verb-first**: "Add…", "Refactor…", "Verify…", "Ship…"
- **Concrete**: mention likely files/modules (src/..., app/..., services/...)
- Include at least one item for **tests/validation**
- Include at least one item for **edge cases/risk** when applicable
- Name concrete validation: "Run npm test", "Add unit tests for X"
- Include safe rollout when relevant: feature flag, migration plan, rollback note

**Checklist Format**:
- Use `[ ]` (brackets with space) for unchecked items
- Do NOT use `- [ ]` (dash + brackets) or other formats
- Keep consistent with template below

### 4. Output Only the Plan

- **Do not preface** the plan with meta explanations
- **Do not say** "Here's the plan:" or "I've created a plan:"
- **Output only** the plan itself using the template
- **No code snippets** in the plan (keep implementation-agnostic)

## Plan Template (Follow Exactly)

```markdown
# Plan

<1–3 sentences: what we're doing, why, and the high-level approach.>

## Scope
- In:
  - <Specific feature or change included>
  - <Another included item>
- Out:
  - <Specific feature or change explicitly excluded>
  - <Another excluded item>

## Action items
[ ] <Step 1: Concrete action with file/command reference>
[ ] <Step 2: Next action in logical order>
[ ] <Step 3: Continue the flow>
[ ] <Step 4: Include test/validation step>
[ ] <Step 5: Include edge case/risk consideration>
[ ] <Step 6: Final rollout or verification step>

## Open questions
- <Question 1: Unknown that needs resolution>
- <Question 2: Another unknown>
- <Question 3: Final unknown (max 3 total)>
```

**If there are no open questions**, omit that section entirely.

## Checklist Item Guidance

### Good Checklist Items

```
[ ] Read auth module (src/auth/) to understand current flow
[ ] Add JWT validation middleware to src/middleware/auth.js
[ ] Update user model (models/User.js) to include role field
[ ] Write unit tests for role-based permissions (tests/auth.test.js)
[ ] Run npm test to verify no regressions
[ ] Test edge case: expired tokens, missing roles
[ ] Update API docs (docs/api.md) with new auth endpoints
[ ] Deploy behind feature flag AUTH_V2 for gradual rollout
```

### Avoid

❌ **Vague steps**: "Handle backend", "Do auth", "Fix the thing"
❌ **Too many micro-steps**: "Open file", "Import module", "Add line 23"
❌ **Code snippets**: Keep plan implementation-agnostic
❌ **Unordered items**: Group logically (discovery → changes → tests → rollout)

## Context-Aware Planning

### Leverage Available Signals

- **Open files**: Current focus—likely area of change
- **Recently viewed**: Shows exploration path and related modules
- **Version control status**: Branch name hints at scope; staged changes show partial work

### Use Common Tools

**Lint/Test output** (when appropriate):
- Before planning refactors, check existing lint or test failures in affected areas
- Include "Fix existing lint issues" in action items if found

**Version control status** (for context):
- Current branch name and staged changes can indicate partial implementation

### VCS-Aware Planning

When relevant:
- **Branch name**: If user is on `feature/user-roles`, scope likely relates to roles
- **Staged changes**: If files already modified, plan may be continuation of work
- **Recent commits**: Show user's recent focus areas

Include in scope:
```markdown
## Scope
- In:
  - Complete user role system started in #123
  - Build on existing auth middleware (already staged)
- Out:
  - Advanced permissions (defer to phase 2)
```

## Examples

### Example 1: Simple Feature Addition

```markdown
# Plan

Add a search bar to the dashboard that filters the user table by name or email. Use existing filter utilities in `utils/filters.js` and the current debounce pattern from other search inputs.

## Scope
- In:
  - Search input component in dashboard header
  - Client-side filtering by name and email
  - Debounce (300ms) to avoid excessive filtering
- Out:
  - Backend API search (use existing data)
  - Advanced filters (date range, role, etc.)
  - Search history or saved searches

## Action items
[ ] Review existing search inputs (e.g., src/components/SearchBar.js) for patterns
[ ] Add SearchInput component to src/components/dashboard/DashboardHeader.js
[ ] Wire up filtering logic using utils/filters.js filterByText() function
[ ] Add debounce hook (300ms) following pattern in src/hooks/useDebounce.js
[ ] Write tests for filtering logic (tests/components/DashboardHeader.test.js)
[ ] Test edge cases: empty search, special characters, very long queries
[ ] Verify no performance issues with large user lists (>1000 rows)
```

### Example 2: Complex Refactoring

```markdown
# Plan

Refactor authentication from session-based to JWT tokens to support mobile clients. This is a breaking change requiring database migration, client updates, and backward compatibility during transition.

## Scope
- In:
  - JWT generation and validation (access + refresh tokens)
  - Update login/logout endpoints to return tokens
  - Middleware to validate JWT on protected routes
  - Migration script for existing sessions
  - Backward compatibility layer (6-week deprecation)
- Out:
  - OAuth integration (defer to separate project)
  - Token revocation list (use short expiry instead)
  - Multi-device token management (v2 feature)

## Action items
[ ] Read current auth implementation (src/auth/session.js, middleware/auth.js)
[ ] Add JWT library (jsonwebtoken) to package.json
[ ] Create JWT service (src/auth/jwt.js) with sign/verify methods
[ ] Update login endpoint (routes/auth.js) to return JWT pair
[ ] Create refresh token endpoint (POST /auth/refresh)
[ ] Update auth middleware (middleware/auth.js) to check JWT or session (compatibility)
[ ] Add migration script (migrations/001_sessions_to_jwt.js) to notify active users
[ ] Write comprehensive tests (tests/auth/jwt.test.js): expiry, invalid tokens, refresh flow
[ ] Test backward compatibility: old session + new JWT simultaneously
[ ] Update API documentation (docs/api.md) with JWT authentication
[ ] Deploy behind feature flag JWT_AUTH with gradual rollout
[ ] Monitor error rates and rollback plan documented in ROLLBACK.md

## Open questions
- Should refresh tokens be stored in database or Redis?
- What's the JWT expiry policy (15min access, 7d refresh)?
- When can we fully deprecate session support (target date)?
```

### Example 3: Bug Fix with Unknowns

```markdown
# Plan

Fix intermittent 500 errors on /api/orders endpoint reported by 3 users. Initial logs suggest database timeout, but root cause unclear. Start with investigation, then implement fix.

## Scope
- In:
  - Investigate logs and reproduce error
  - Identify root cause (likely DB query performance)
  - Implement targeted fix
  - Add monitoring to prevent recurrence
- Out:
  - Full database query optimization (separate task)
  - Orders service rewrite (too large for bug fix)

## Action items
[ ] Check error logs (CloudWatch/Datadog) for /api/orders 500s in last 7 days
[ ] Identify affected user IDs and order patterns (large orders? specific time?)
[ ] Reproduce error locally or in staging with affected data
[ ] Profile slow database queries (enable query logging or use EXPLAIN)
[ ] Implement fix (likely add index, optimize query, or increase timeout)
[ ] Add database query performance monitoring (alert if >2s)
[ ] Write regression test (tests/api/orders.test.js) for identified scenario
[ ] Deploy to staging and verify fix with reproduced scenario
[ ] Monitor production for 48h after deployment

## Open questions
- Are errors correlated with time of day (load-related)?
- Do affected orders have unusually large line item counts?
```

## Anti-Patterns

### ❌ Too Vague
```
[ ] Update the backend
[ ] Fix auth
[ ] Handle errors
```

### ✅ Concrete
```
[ ] Add JWT validation to src/middleware/auth.js
[ ] Update error handler (src/utils/errors.js) to return 401 for invalid tokens
[ ] Test error responses with invalid/expired/missing tokens
```

---

### ❌ Too Many Micro-Steps
```
[ ] Open src/auth.js
[ ] Import jwt library at line 3
[ ] Add validateToken function after line 45
[ ] Add try-catch block at line 47
[ ] Return error at line 50
```

### ✅ Appropriately Scoped
```
[ ] Add JWT validation function to src/auth.js with error handling
```

---

### ❌ Code in Plan
```
[ ] Update auth.js:
    ```javascript
    function validateToken(token) {
      return jwt.verify(token, SECRET);
    }
    ```
```

### ✅ Implementation-Agnostic
```
[ ] Add JWT validation function to src/auth.js using jsonwebtoken library
```

## Quality Checklist

Before delivering the plan, verify:

- [ ] Plan is 1 concise paragraph (1-3 sentences)
- [ ] Scope is clear (In/Out sections populated)
- [ ] 6-10 action items (not too few, not too many)
- [ ] Items are ordered logically (discovery → changes → tests → rollout)
- [ ] Items are verb-first and concrete
- [ ] At least one test/validation item included
- [ ] At least one edge case/risk item included (when applicable)
- [ ] File paths or commands mentioned where helpful
- [ ] No code snippets in the plan
- [ ] Open questions section included only if needed (max 3)
- [ ] No meta explanation before the plan ("Here's the plan:")
- [ ] Checklist uses `[ ]` format (not `- [ ]`)

## Notes

- This skill creates **plans only**, not todos. The user or agent can create todos separately if desired.
- Plans are meant to be **discussed and refined**. If the user wants changes, update the plan.
- If the user proceeds with implementation, the plan serves as a **roadmap** but isn't binding.
- For very large projects, consider creating **phased plans** (Phase 1, Phase 2) with separate scope.
