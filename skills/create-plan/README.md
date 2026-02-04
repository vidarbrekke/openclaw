# Create Plan Skill

Create concise, actionable plans with context-aware guidance.

## Strategy: Context-Aware Planning

This skill provides a structured planning workflow while leveraging available repository context:
- Open or recently viewed files (current focus)
- Version control status (branch name, staged changes)
- Lint/test output (existing issues)
- Project docs (README, CONTRIBUTING, architecture notes)

## Design Principles (DRY, YAGNI, Scalability)

- **DRY**: High - Reuses a proven workflow structure
- **YAGNI**: High - Only adds context that improves plans
- **Complexity**: Medium - Context integration justified by better plans
- **Scalability**: High - Adapts to project complexity

## Strategy Evaluation

### Evaluated Strategies

1. **Direct Translation** - Port as-is with minimal changes
2. **Interactive Todo Integration** - Convert plans to trackable tasks
3. **Minimal Template-Only** - Strip to essentials
4. **Context-Aware Planning** ✅ WINNER - Leverage repository signals

### Why Enhanced Context Won

- ✅ Leverages repository context (open files, git status)
- ✅ Notes existing lint/test issues in scope
- ✅ Uses structured questions when needed
- ✅ Git-aware planning improves scoping
- ✅ Still respects read-only mode and simplicity
- ❌ Slightly more complex than direct port (justified)

## Usage

The skill triggers when users ask for plans:
- "Create a plan for adding user authentication"
- "What's the approach for refactoring this module?"
- "Break down this feature into steps"

### Context Signals Used

- Open and recently viewed files (shows user's focus)
- Version control status (branch name, staged changes)
- Recent lint/test output (existing issues)

## Plan Template

```markdown
# Plan

<1-3 sentences: what, why, approach>

## Scope
- In:
  - <Included items>
- Out:
  - <Excluded items>

## Action items
[ ] <Step 1>
[ ] <Step 2>
[ ] <Step 3>
[ ] <Step 4>
[ ] <Step 5>
[ ] <Step 6>

## Open questions
- <Question 1>
- <Question 2>
```

## Key Guidelines

1. **Read-only mode**: Never write files during planning
2. **Minimal questions**: Ask at most 1-2, only if blocking
3. **6-10 action items**: Not too few, not too many
4. **Ordered items**: discovery → changes → tests → rollout
5. **Concrete steps**: Mention files, commands, validation
6. **No code snippets**: Keep implementation-agnostic

## Quality Requirements

Every plan must include:
- ✅ Concise 1-paragraph introduction
- ✅ Clear scope (In/Out sections)
- ✅ 6-10 action items, ordered logically
- ✅ At least one test/validation item
- ✅ At least one edge case/risk item (when applicable)
- ✅ Verb-first, concrete action items
- ✅ File paths or commands where helpful

## Examples

### Simple Feature
```markdown
# Plan

Add search bar to dashboard filtering users by name/email using existing filter utils.

## Scope
- In: Search input, client-side filtering, debounce
- Out: Backend API search, advanced filters

## Action items
[ ] Review existing search patterns (src/components/SearchBar.js)
[ ] Add SearchInput to src/components/dashboard/DashboardHeader.js
[ ] Wire up filtering with utils/filters.js
[ ] Add debounce (300ms) using src/hooks/useDebounce.js
[ ] Write tests (tests/components/DashboardHeader.test.js)
[ ] Test edge cases: empty search, special chars, >1000 rows
```

### Complex Refactoring
```markdown
# Plan

Refactor auth from sessions to JWT for mobile support. Breaking change with migration and backward compatibility.

## Scope
- In: JWT generation/validation, endpoint updates, migration, compatibility layer
- Out: OAuth, token revocation, multi-device management

## Action items
[ ] Read current auth (src/auth/session.js, middleware/auth.js)
[ ] Add JWT library and create jwt.js service
[ ] Update login endpoint to return JWT pair
[ ] Create refresh token endpoint
[ ] Update middleware for JWT or session (compatibility)
[ ] Add migration script for active users
[ ] Write comprehensive JWT tests (expiry, invalid, refresh)
[ ] Test backward compatibility (old + new simultaneously)
[ ] Update API docs with JWT auth
[ ] Deploy behind feature flag with gradual rollout
[ ] Monitor and document rollback plan

## Open questions
- Refresh token storage: database or Redis?
- JWT expiry policy: 15min access, 7d refresh?
- Session deprecation target date?
```

## Installation

No installation needed! This is a workflow skill (guidance only).

## SKILL.md Size

342 lines (well under 500-line recommendation)

## Related Skills

- `humanizer`: Improve plan writing to sound natural
- `planning-guidelines`: Establish team planning conventions
- Consider: Todo management skill (separate from planning)
