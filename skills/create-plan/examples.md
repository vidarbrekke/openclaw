# Create Plan - Examples

Real-world planning examples demonstrating the skill in action.

## Example 1: API Feature Addition

**User Request**: "I need to add pagination to the /api/users endpoint"

**Plan Output**:

```markdown
# Plan

Add pagination to `/api/users` endpoint to handle large user lists efficiently. Use cursor-based pagination (not offset) to avoid performance issues with skipped rows. Return metadata with pagination links.

## Scope
- In:
  - cursor-based pagination (user ID as cursor)
  - Query parameters: `limit` (default 20, max 100) and `cursor`
  - Response metadata: `next_cursor`, `has_more`, `total_count`
  - Backward compatibility: no `limit` param returns all (current behavior)
- Out:
  - Offset-based pagination (slow for large datasets)
  - Search/filtering within pagination (separate feature)
  - Frontend pagination UI updates (separate task)

## Action items
[ ] Review current `/api/users` endpoint implementation (routes/users.js, controllers/users.js)
[ ] Add pagination query parameters to route schema validation
[ ] Update user query (models/User.js) to support cursor and limit
[ ] Add response metadata structure (next_cursor, has_more, total_count)
[ ] Write unit tests for pagination logic (tests/api/users.test.js): edge cases, limits, cursors
[ ] Test with large dataset (>10k users) to verify performance
[ ] Update API documentation (docs/api.md) with pagination examples
[ ] Verify backward compatibility: requests without limit param still work

## Open questions
- Should we paginate soft-deleted users or exclude by default?
```

---

## Example 2: Database Migration

**User Request**: "We need to add a 'role' field to users for permissions"

**Plan Output**:

```markdown
# Plan

Add `role` field to User model for role-based access control (RBAC). Create migration to add column, seed with default role, and update auth middleware to check roles. Safe migration with no downtime.

## Scope
- In:
  - Database migration: add `role` column (default: 'user')
  - Update User model with role field
  - Seed existing users with 'user' role
  - Update auth middleware to include role in JWT
  - Add role validation utilities
- Out:
  - Fine-grained permissions matrix (defer to separate task)
  - Admin UI for role management (separate feature)
  - Role inheritance or hierarchies (v2)

## Action items
[ ] Review User model (models/User.js) and current auth flow
[ ] Create migration file (migrations/YYYYMMDD_add_user_roles.js) to add role column
[ ] Add role field to User model with enum validation ['user', 'admin', 'moderator']
[ ] Update seed script to set existing users to 'user' role
[ ] Modify JWT payload generation (src/auth/jwt.js) to include role
[ ] Add role validation middleware (middleware/requireRole.js)
[ ] Write tests for role validation (tests/middleware/requireRole.test.js)
[ ] Test migration rollback script to ensure reversibility
[ ] Update API documentation with role requirements per endpoint
[ ] Run migration in staging and verify no errors
[ ] Monitor production migration with rollback plan ready

## Open questions
- Should superadmin role have separate handling?
- Can users have multiple roles or single role only?
```

---

## Example 3: Performance Optimization

**User Request**: "The dashboard is loading slowly—can you investigate and fix?"

**Plan Output**:

```markdown
# Plan

Investigate and optimize dashboard load time currently >3s (target: <1s). Profile to identify bottlenecks, likely causes: N+1 queries, large data fetches, or slow components. Implement targeted optimizations.

## Scope
- In:
  - Profile dashboard load (network, database, rendering)
  - Fix identified bottlenecks (likely: eager loading, caching, lazy components)
  - Add performance monitoring
  - Verify <1s load time with realistic data
- Out:
  - Full dashboard redesign (use existing components)
  - Backend infrastructure changes (keep current setup)
  - Unrelated optimization (focus on dashboard only)

## Action items
[ ] Profile dashboard load with browser DevTools (Network, Performance tabs)
[ ] Enable database query logging to identify slow queries
[ ] Review dashboard API endpoint (routes/dashboard.js): check for N+1 queries
[ ] Check dashboard component (components/Dashboard.js) for unnecessary re-renders
[ ] Identify largest bottleneck (database, API, or frontend rendering)
[ ] Implement fix: add eager loading, caching layer, or React.memo as appropriate
[ ] Add performance monitoring (log dashboard load time to analytics)
[ ] Test with realistic dataset (>1000 users, >5000 records) to verify <1s load
[ ] Write performance regression test (tests/performance/dashboard.test.js)
[ ] Deploy to staging and measure improvement with real data

## Open questions
- What's the current load time with production-sized data?
- Are there specific sections of dashboard that are slowest?
- What's the acceptable degradation for very large datasets (>100k records)?
```

---

## Example 4: Bug Fix with Investigation

**User Request**: "Users are getting logged out randomly—please fix"

**Plan Output**:

```markdown
# Plan

Investigate and fix random user logouts. Possible causes: session expiry, JWT expiry, cookie issues, or race conditions. Start with log analysis to identify pattern, then implement targeted fix.

## Scope
- In:
  - Analyze error logs and user reports for patterns
  - Reproduce issue in staging/local environment
  - Identify root cause (session expiry, cookie config, race condition)
  - Implement fix with tests
  - Add monitoring to detect future occurrences
- Out:
  - Complete session management rewrite (too large for bug fix)
  - Auth system redesign (separate project)

## Action items
[ ] Gather user reports: affected users, frequency, browser/device patterns
[ ] Check error logs (CloudWatch/Datadog) for auth errors during reported times
[ ] Review session/JWT expiry configuration (config/auth.js)
[ ] Check cookie settings (httpOnly, secure, sameSite, domain)
[ ] Attempt to reproduce: simulate user behavior leading to logouts
[ ] Identify root cause based on logs and reproduction
[ ] Implement targeted fix (likely: extend session expiry, fix cookie config, or race condition)
[ ] Write regression test (tests/auth/session.test.js) for identified scenario
[ ] Add monitoring: alert on auth error rate >1% or logout spike
[ ] Deploy to staging and verify fix with affected users
[ ] Monitor production for 48h post-deployment

## Open questions
- Are logouts correlated with specific actions (page nav, API calls)?
- Do affected users share browser/device characteristics?
- What's the current session expiry setting?
```

---

## Example 5: New Feature with Unknowns

**User Request**: "Add real-time notifications to the app"

**Plan Output**:

```markdown
# Plan

Add real-time notifications using WebSockets to push updates to connected clients. Support notification types: mentions, replies, system alerts. Store notifications in database with read/unread status.

## Scope
- In:
  - WebSocket server setup (Socket.io or native WebSockets)
  - Notification model (database schema)
  - API to fetch historical notifications
  - Real-time push for new notifications
  - Client-side notification UI component
  - Mark as read/unread functionality
- Out:
  - Email notification fallback (separate feature)
  - Push notifications (mobile/desktop) (defer to v2)
  - Notification preferences/settings (separate task)
  - Advanced notification grouping (v2)

## Action items
[ ] Review tech stack and existing WebSocket usage (check if Socket.io already used)
[ ] Design notification schema (models/Notification.js): user_id, type, content, read, timestamp
[ ] Create migration to add notifications table
[ ] Set up WebSocket server (server/websocket.js) or Socket.io namespace
[ ] Implement notification creation logic (services/notifications.js) for mentions/replies
[ ] Add API endpoint to fetch historical notifications (GET /api/notifications)
[ ] Create client-side WebSocket connection and notification listener
[ ] Build notification UI component (components/NotificationBell.js)
[ ] Add mark-as-read functionality (API + WebSocket update)
[ ] Write tests: notification creation, WebSocket delivery, mark-as-read (tests/notifications/)
[ ] Test edge cases: offline users, rapid notifications, connection drops
[ ] Deploy behind feature flag REALTIME_NOTIFICATIONS for gradual rollout

## Open questions
- What's the notification retention policy (delete after 30 days)?
- Should we use Socket.io (existing?) or native WebSockets?
- How many concurrent WebSocket connections do we expect (scaling concerns)?
```

---

## Example 6: Refactoring Without Breaking Changes

**User Request**: "Refactor the payment module—it's getting messy"

**Plan Output**:

```markdown
# Plan

Refactor payment module (src/payments/) to improve maintainability without changing external behavior. Extract provider-specific logic into adapters, consolidate error handling, and add comprehensive tests. Zero customer impact.

## Scope
- In:
  - Extract Stripe-specific logic to adapter (src/payments/adapters/stripe.js)
  - Create payment service interface (src/payments/PaymentService.js)
  - Consolidate error handling and logging
  - Add missing tests for edge cases
  - Maintain 100% backward compatibility
- Out:
  - Add new payment providers (separate task)
  - Change payment flow or user-facing behavior
  - Database schema changes (not needed for refactor)

## Action items
[ ] Review current payment module structure (src/payments/) and identify problem areas
[ ] Map out payment flow: createPayment, processRefund, handleWebhook
[ ] Create PaymentService interface (src/payments/PaymentService.js) with clear methods
[ ] Extract Stripe logic to adapter (src/payments/adapters/StripeAdapter.js) implementing interface
[ ] Consolidate error handling: create PaymentError class (src/payments/errors.js)
[ ] Update all payment calls to use new service interface (no external API changes)
[ ] Add comprehensive tests (tests/payments/): success, failure, retries, webhooks
[ ] Run full regression test suite to ensure zero behavior changes
[ ] Review code with team before merge (breaking changes check)
[ ] Deploy to staging and verify all payment flows work identically
[ ] Monitor production payment success rates for 1 week post-deployment

## Open questions
- Are there undocumented payment edge cases we should test?
```

---

## Anti-Pattern Examples

### ❌ Vague and Unactionable

```markdown
# Plan

Fix the authentication system.

## Action items
[ ] Look at the auth code
[ ] Make it better
[ ] Test it
[ ] Deploy
```

**Problems**: No specifics, no file references, no concrete steps.

---

### ❌ Too Detailed (Micro-Management)

```markdown
# Plan

Add search bar to dashboard.

## Action items
[ ] Open src/components/Dashboard.js
[ ] Import SearchBar component at line 3
[ ] Add SearchBar to JSX at line 87
[ ] Pass props: placeholder, onChange, value
[ ] Open src/hooks/useSearch.js
[ ] Add useState for search term at line 5
[ ] Add useEffect for debounce at line 12
[ ] Return search term and setter at line 25
[ ] Open src/utils/filters.js
[ ] Add filterBySearch function at line 45
[ ] Implement case-insensitive matching at line 47
[ ] Return filtered results at line 52
```

**Problems**: Too granular, prescribes implementation details, no flexibility.

---

### ❌ Code in Plan

```markdown
# Plan

Add JWT authentication.

## Action items
[ ] Update auth.js:
    ```javascript
    const jwt = require('jsonwebtoken');
    
    function generateToken(user) {
      return jwt.sign({ id: user.id }, process.env.SECRET, { expiresIn: '1h' });
    }
    ```
[ ] Update middleware:
    ```javascript
    function verifyToken(req, res, next) {
      const token = req.headers.authorization;
      if (!token) return res.status(401).send();
      // ... more code
    }
    ```
```

**Problems**: Plans should be implementation-agnostic, not code tutorials.

---

## Tips for Great Plans

### 1. Start with User Intent
Good: "Add pagination to handle large user lists efficiently"
Bad: "Modify the API"

### 2. Be Specific About Files
Good: "Update User model (models/User.js) with role field"
Bad: "Change the database"

### 3. Include Validation
Good: "Test with >10k records to verify performance"
Bad: "Make sure it works"

### 4. Consider Rollout
Good: "Deploy behind feature flag with gradual rollout"
Bad: "Push to production"

### 5. Scope Appropriately
Good: "In: JWT tokens. Out: OAuth integration (defer)"
Bad: No scope section or vague boundaries

### 6. Order Logically
Good: Investigate → Design → Implement → Test → Deploy
Bad: Random order or skipping steps

### 7. Name Edge Cases
Good: "Test edge cases: expired tokens, missing roles, rate limits"
Bad: "Handle errors"

---

## Using Plans Effectively

### After Creating a Plan

1. **Review with user**: "Does this scope look right?"
2. **Refine if needed**: User may want to adjust In/Out scope
3. **Proceed or pause**: User decides whether to implement now or later
4. **Use as roadmap**: Plan guides implementation but isn't rigid

### Updating Plans Mid-Implementation

If scope changes during work:
- Create an updated plan
- Mark changed items clearly
- Communicate scope change to user

---

These examples demonstrate the skill's flexibility across different project types and complexity levels while maintaining consistent structure and quality.
