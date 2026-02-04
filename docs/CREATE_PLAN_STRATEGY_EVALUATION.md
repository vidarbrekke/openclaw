# Create Plan Skill - Strategy Evaluation

Detailed analysis of the four strategies evaluated for converting OpenAI's "create-plan" skill.

---

## Strategy 1: Direct Translation with Cursor Paths

### Description

Port the OpenAI skill almost exactly as-is, adapting only path references to Cursor workspace conventions. Keep the read-only mandate, minimal questions guideline (1-2 max), and exact template format. Change references from generic paths to Cursor-specific context files (README.md, CONTRIBUTING.md, etc.). Maintain the 6-10 action item default and all formatting rules. No integration with Cursor-specific tools or context.

### Trade-offs

**Advantages:**
- ✅ Minimal adaptation effort—proven workflow preserved exactly
- ✅ Battle-tested guidelines from OpenAI's usage
- ✅ Clear template ensures consistent output format
- ✅ Read-only mode aligns perfectly with planning phase
- ✅ Simple to understand and maintain
- ✅ No risk of over-engineering

**Disadvantages:**
- ❌ Doesn't leverage Cursor's TodoWrite tool (plans remain static)
- ❌ Misses opportunity to integrate with Cursor context (open files, lints)
- ❌ No git-aware planning (branch names, staged changes ignored)
- ❌ Template is static markdown, not interactive
- ❌ Agent must manually gather all context (no automatic injection)
- ❌ Doesn't use AskQuestion tool (text-based questions only)

### Evaluation

- **Complexity**: Low (minimal changes from original)
- **DRY**: High (reuses proven OpenAI patterns exactly)
- **YAGNI**: High (no unnecessary additions beyond core workflow)
- **Scalability**: Medium (works well but no growth hooks or enhancements)

### Example Output

```markdown
# Plan

Add pagination to /api/users endpoint using offset-based approach.

## Scope
- In: Offset pagination, limit parameter
- Out: Cursor-based pagination

## Action items
[ ] Review current endpoint implementation
[ ] Add pagination parameters
[ ] Update database query
[ ] Write tests
[ ] Update documentation
[ ] Deploy
```

**Analysis**: Functional but generic—doesn't leverage Cursor's awareness of what files are open or what the user is currently working on.

---

## Strategy 2: Cursor TodoWrite Integration

### Description

Adapt the skill to leverage Cursor's TodoWrite tool. After creating the plan in markdown format, automatically convert action items into Cursor todos with proper status tracking (pending, in_progress, completed). Plans become interactive—agent can mark items as in_progress when starting work and completed when finished. Integrate with Cursor's todo system for persistent task management across sessions. Enhance template format with todo metadata (IDs, status, dependencies).

### Trade-offs

**Advantages:**
- ✅ Plans become actionable and trackable over time
- ✅ Integrates with Cursor's native todo system UI
- ✅ Agent can update progress in real-time as work proceeds
- ✅ Better for multi-step tasks spanning multiple sessions
- ✅ Users see progress visualization in Cursor UI
- ✅ Persistent state survives session restarts

**Disadvantages:**
- ❌ More complex—requires TodoWrite tool usage and state management
- ❌ Changes output format (todos instead of pure markdown)
- ❌ May be overkill for simple planning requests
- ❌ TodoWrite has minimum 2-item requirement (constraint)
- ❌ Mixes planning (read-only) with execution tracking (stateful)
- ❌ Plans lose human-readable markdown format
- ❌ Not all plans need execution tracking

### Evaluation

- **Complexity**: High (tool integration + state management + lifecycle)
- **DRY**: Medium (mixes two concerns: planning and execution tracking)
- **YAGNI**: Low (adds significant features beyond core planning need)
- **Scalability**: High (enables long-running task management and progress tracking)

### Example Output

```javascript
// Plan created, then immediately converted to todos
TodoWrite({
  todos: [
    { id: '1', content: 'Review current endpoint implementation', status: 'pending' },
    { id: '2', content: 'Add pagination parameters', status: 'pending' },
    { id: '3', content: 'Update database query', status: 'pending' },
    { id: '4', content: 'Write tests', status: 'pending' },
    { id: '5', content: 'Update documentation', status: 'pending' },
    { id: '6', content: 'Deploy', status: 'pending' }
  ],
  merge: false
});

// Agent marks todos in_progress as work proceeds
TodoWrite({
  todos: [
    { id: '1', status: 'completed' },
    { id: '2', status: 'in_progress' }
  ],
  merge: true
});
```

**Analysis**: Powerful for long-running tasks but over-engineered for simple "show me the approach" planning requests. Violates separation of concerns (planning vs. execution).

---

## Strategy 3: Minimal Template-Only

### Description

Strip down to bare essentials: provide the plan template and core formatting rules only (3-5 rules max). Remove detailed workflow steps, question-asking guidelines, and checklist guidance. Trust the agent's intelligence to gather context appropriately and structure plans well. Focus purely on output format consistency. One-page skill (<50 lines) with template and minimal instructions.

### Trade-offs

**Advantages:**
- ✅ Smallest footprint—under 50 lines total
- ✅ Respects YAGNI—no prescriptive workflow steps
- ✅ Agent flexibility to adapt to specific context
- ✅ Easy to maintain and customize per user
- ✅ No risk of over-specification
- ✅ Fastest to read and apply

**Disadvantages:**
- ❌ Lacks guidance on context gathering (agent may miss important files)
- ❌ No question-asking strategy (may over-ask or under-ask)
- ❌ Risks inconsistent plan quality across requests
- ❌ New or less-capable agents may not know how to use effectively
- ❌ No guidance on scope definition or action item ordering
- ❌ Loses OpenAI's battle-tested best practices

### Evaluation

- **Complexity**: Low (template + 3-5 rules only)
- **DRY**: High (single source of truth for format)
- **YAGNI**: High (absolute bare minimum)
- **Scalability**: Low (no structure for handling complex scenarios)

### Example Skill Content

```markdown
---
name: create-plan
description: Create a concise plan. Use when user asks for a plan.
---

# Create Plan

Output plans using this template:

# Plan
<1-3 sentences>

## Scope
- In: <items>
- Out: <items>

## Action items
[ ] <item 1>
[ ] <item 2>
...

Rules:
1. Read-only mode (no file writes)
2. 6-10 action items, ordered logically
3. Verb-first, concrete items
4. Ask max 1-2 questions if blocking
5. No code snippets in plan
```

**Analysis**: Too minimal—loses valuable guidance that ensures plan quality and consistency. Risky approach that trusts agent intelligence too much.

---

## Strategy 4: Enhanced with Cursor Context ✅ WINNER

### Description

Port OpenAI's proven workflow but enhance context gathering with Cursor-specific features. Add guidance to leverage: open files in editor (user's current focus), recent linter errors via ReadLints (existing issues to consider), git status (branch names, staged changes), recently viewed files (exploration path). Leverage Cursor's `<open_and_recently_viewed_files>` automatic context injection. Keep the template format and read-only mode unchanged. Add optional git-aware planning (branch-specific scope, staged changes awareness). Maintain 1-2 question limit but suggest using AskQuestion tool for structured multiple-choice questions (better UX than text).

### Trade-offs

**Advantages:**
- ✅ Leverages Cursor's automatic context injection (no extra work)
- ✅ More informed plans—agent sees what user is actively working on
- ✅ Git-aware planning for better scoping (branch names hint at feature)
- ✅ ReadLints integration catches existing issues before planning new work
- ✅ AskQuestion tool for efficient structured questions (better UX)
- ✅ Still respects read-only mode and planning simplicity
- ✅ Preserves OpenAI's proven workflow structure
- ✅ Uses the right Cursor tools without over-engineering

**Disadvantages:**
- ❌ Slightly more complex than direct translation (justified by value)
- ❌ Requires understanding Cursor-specific context sources
- ❌ May gather too much context for very simple planning requests
- ❌ Agent needs to know when to use ReadLints vs. skip
- ❌ Documentation longer than pure translation (more guidance)

### Evaluation

- **Complexity**: Medium (Cursor integrations add value without overwhelming)
- **DRY**: High (reuses OpenAI patterns + appropriate Cursor tools)
- **YAGNI**: High (only adds context that directly improves plan quality)
- **Scalability**: High (adapts to project complexity and user workflow)

### Example Context Usage

**Automatic Context (no work needed)**:
```
<open_and_recently_viewed_files>
- src/auth/jwt.js (currently focused)
- src/auth/session.js (recently viewed)
- src/middleware/auth.js (recently viewed)
</open_and_recently_viewed_files>
```

**Active Context Gathering**:
```javascript
// Check for existing linter errors in auth module
ReadLints(['src/auth/']);
// Returns: 3 lint errors in jwt.js (unused variables)

// Git context
git status
// On branch feature/jwt-auth
// Changes staged: src/auth/jwt.js (partial implementation)
```

**Resulting Plan** (informed by context):
```markdown
# Plan

Complete JWT authentication refactor started in feature/jwt-auth branch. Build on existing jwt.js implementation (already staged) and integrate with current auth middleware.

## Scope
- In:
  - Complete JWT implementation in src/auth/jwt.js
  - Fix 3 existing lint errors (unused variables)
  - Integrate with src/middleware/auth.js
- Out:
  - Session system removal (defer to separate task)
  - Token refresh endpoint (add in follow-up)

## Action items
[ ] Fix lint errors in src/auth/jwt.js (3 unused variables)
[ ] Complete JWT validation logic in jwt.js (building on staged work)
[ ] Update src/middleware/auth.js to check JWT tokens
[ ] Add tests for JWT validation (tests/auth/jwt.test.js)
[ ] Test integration with existing session flow (backward compatibility)
[ ] Update branch and prepare for review
```

**Analysis**: Plan is context-aware—references open files, acknowledges staged changes, includes fixing existing lint errors. Much more useful than generic plan.

---

## Comparison Matrix

| Strategy | Complexity | DRY | YAGNI | Scalability | Notes |
|----------|-----------|-----|-------|-------------|-------|
| 1. Direct Translation | Low | High | High | Medium | Safe, proven, but generic |
| 2. TodoWrite Integration | High | Medium | Low | High | Over-engineered for planning |
| 3. Minimal Template-Only | Low | High | High | Low | Too minimal, risky quality |
| 4. Cursor Context Enhanced | Medium | High | High | High | ✅ Best balance |

---

## Decision Rationale

### Why Not Strategy 1 (Direct Translation)?

While safe and proven, it misses Cursor's unique value proposition: automatic context awareness. Plans would be generic without considering what files the user has open or what they're currently working on.

### Why Not Strategy 2 (TodoWrite Integration)?

This violates separation of concerns by mixing planning (read-only, exploratory) with execution tracking (stateful, persistent). Not all plans need todo tracking—sometimes users just want to see the approach before deciding. Over-engineers the solution.

### Why Not Strategy 3 (Minimal Template)?

Too minimal. Loses OpenAI's valuable workflow guidance (when to ask questions, how many action items, ordering logic). Risks inconsistent quality and doesn't provide enough structure for complex planning scenarios.

### Why Strategy 4 Wins

**Best balance of simplicity and value**:
- Preserves OpenAI's proven workflow (battle-tested structure)
- Adds Cursor-specific enhancements that directly improve plan quality
- Respects YAGNI—only integrates tools that provide clear value
- Medium complexity justified by significantly better-informed plans
- Scales well from simple to complex planning scenarios

**Key advantage**: Plans are **context-aware** without requiring agent to manually gather everything. Cursor automatically provides open files, git status, and recently viewed files—agent just needs guidance on how to use this context effectively.

---

## Implementation Details

### What Was Kept from OpenAI

- ✅ Read-only mode during planning
- ✅ 1-2 question maximum (only if blocking)
- ✅ 6-10 action items default
- ✅ Verb-first, concrete action items
- ✅ Ordered workflow: discovery → changes → tests → rollout
- ✅ Exact template format (Plan, Scope, Action items, Open questions)
- ✅ No code snippets in plans
- ✅ Quality guidelines (concrete, file-specific, validation steps)

### What Was Enhanced for Cursor

- ✅ Leverage `<open_and_recently_viewed_files>` automatic context
- ✅ Use ReadLints to check for existing issues
- ✅ Check git status for branch/staged changes context
- ✅ Suggest AskQuestion tool for structured questions
- ✅ Git-aware scoping (branch names, partial work acknowledgment)
- ✅ Cursor position awareness (what function user is examining)
- ✅ Use Glob for file discovery when needed
- ✅ Document Cursor-specific context sources

### What Was Not Added (YAGNI)

- ❌ TodoWrite integration (separate concern)
- ❌ Automatic plan execution (planning is read-only)
- ❌ Plan versioning or history (too complex)
- ❌ Team collaboration features (out of scope)
- ❌ Plan templates for specific domains (too prescriptive)
- ❌ Integration with external project management tools

---

## Testing Scenarios

### Scenario 1: Simple Feature
**Request**: "Add search bar to dashboard"
**Context**: No files open, main branch
**Expected**: Generic but well-structured plan

### Scenario 2: Continuation of Work
**Request**: "Complete the JWT auth implementation"
**Context**: jwt.js open, feature/jwt-auth branch, staged changes
**Expected**: Context-aware plan acknowledging partial work

### Scenario 3: Bug Fix
**Request**: "Fix the login timeout issue"
**Context**: auth.js open with lint errors, error logs in terminal
**Expected**: Investigation-first plan, includes fixing lint errors

### Scenario 4: Refactoring
**Request**: "Refactor the payments module"
**Context**: Multiple payment files recently viewed
**Expected**: Comprehensive plan maintaining backward compatibility

---

## Future Enhancements (Not Implemented)

Potential improvements for future versions:

1. **Plan Templates**: Domain-specific templates (API endpoint, refactoring, bug fix)
2. **Plan Versioning**: Track plan changes as requirements evolve
3. **Estimation**: Add optional time/complexity estimates per item
4. **Dependencies**: Mark items with dependencies (blocked/blocking)
5. **Risk Scoring**: Automatic risk assessment per action item
6. **Team Integration**: Share plans with team members
7. **Learning**: Improve plans based on implementation outcomes

These were deliberately excluded (YAGNI) but could be added if user needs emerge.

---

## Conclusion

Strategy 4 (Enhanced with Cursor Context) provides the best balance of:
- **Simplicity**: Preserves OpenAI's proven workflow
- **Value**: Leverages Cursor's unique context awareness
- **Scalability**: Works for simple and complex scenarios
- **YAGNI**: Only adds features that clearly improve plans
- **DRY**: Reuses existing patterns and tools appropriately

The added complexity (medium vs. low) is justified by significantly better-informed, more actionable plans.
