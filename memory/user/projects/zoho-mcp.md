# Zoho Books MCP Server

**Repository:** ~/clawd/zoho-books-mcp (local)
**Description:** MCP server integrating OpenClaw with Zoho Books API for financial insights.
**Status:** Phase 1 Foundation (nearly complete)

---

<quick_reference>
- **Stack:** Node.js (TypeScript), MCP server
- **Auth:** OAuth Device Authorization Grant flow (headless/TV-style)
- **API Base:** `https://www.zohoapis.com/books/v3`
- **Rate Limits:** 100 req/min, 1000-10000/day depending on plan
</quick_reference>

<constraints>
- Requires `organization_id` per request
- Uses OAuth2 tokens (`Authorization: Zoho-oauthtoken {token}`)
- Phase 1 is READ-ONLY — no write operations
</constraints>

---

## OAuth Device Flow

1. Initiate → get `user_code`, `verification_url`, `device_code`
2. Display URL+code to user
3. Poll every 5s for token
4. Store access_token + refresh_token
5. Auto-refresh tokens when access expires
6. User can revoke via accounts.zoho.com

## Required Scopes

```
ZohoBooks.settings.READ    # org/company info
ZohoBooks.contacts.READ    # customers/suppliers
ZohoBooks.banking.READ     # bank accounts, transactions
ZohoBooks.sales.READ       # invoices, payments
ZohoBooks.purchases.READ   # bills, expenses
ZohoBooks.inventory.READ   # items, stock
ZohoBooks.reports.READ     # key for insights
```

---

## Implementation Plan

### Phase 1: Foundation (Read-Only Access) ✅ COMPLETE
- [x] Git init + project structure
- [x] OAuth device flow with token storage
- [x] Zoho client wrapper (base HTTP, retries, rate limit handling)
- [x] MCP server skeleton with tool definitions
- [x] Core read tools:
  - [x] Get organizations (list/select org)
  - [x] Get company info/dashboard
  - [x] List/read invoices
  - [x] List/read expenses/bills
  - [x] List/read customer contacts
  - [x] List/read bank accounts/transactions
  - [x] List/read items/products
  - [x] Basic reports (profit/loss, balance sheet)

### Phase 2: Insights Engine
- [ ] Data aggregation layer (fetch multiple endpoints, cache locally)
- [ ] Analytics logic:
  - [ ] Cash flow trends
  - [ ] AR aging analysis
  - [ ] Top customers/revenue concentration
  - [ ] Expense categorization & trends
  - [ ] Burn rate vs revenue
  - [ ] Outstanding vs collected
- [ ] Daily report generation with recommendations
- [ ] MCP tool: `generate_daily_report`

### Phase 3: Polish & Deployment
- [ ] Error handling & edge cases
- [ ] Config file for defaults (org_id preference, timezone, currency)
- [x] Documentation (README.md, OPENCLAW-INTEGRATION.md complete)
- [ ] OpenClaw agent configuration (ready to integrate)
- [ ] Claude Code / Pi integration test

---

## Code Quality Review (2026-02-05)

### ✅ Strengths

1. **Authentication (ZohoClient)**
   - OAuth device flow properly implemented with polling + backoff
   - Token refresh with automatic expiry detection (5-min buffer)
   - Clean separation of device flow vs refresh logic
   - Proper error handling for auth edge cases (authorization_pending, slow_down, expired_token)

2. **Axios Integration**
   - Smart request/response interceptors for auth headers + org_id injection
   - 401 auto-retry with token refresh
   - 429 rate limit handling with Retry-After respect

3. **Type Safety**
   - Comprehensive Zod schemas for all Zoho objects (Organization, Invoice, Customer, Bill, Payment, Account, BankTransaction, Item)
   - Proper validation on API responses before use
   - Types exported for external consumption

4. **API Client Methods**
   - All Phase 1 tools implemented (organizations, invoices, expenses, bills, customers, bank transactions, items)
   - Consistent filtering params (page, per_page, status, date, etc.)
   - Proper sorting defaults (sort_column, sort_order)

5. **Configuration**
   - Zod-based config validation with sensible defaults
   - Rate limit awareness (650ms delay = ~100 req/min)
   - Token refresh window (5 min before expiry)
   - Debug logging support

### 🟡 Issues & Improvements Needed

**Critical:**
1. **ZohoClient.ts - Duplicate return statement** (line 69-70)
   - Both `return config` statements present — remove one
   - This is a code smell but harmless (second unreachable)

2. **MCP Bridge incomplete** (mcp-bridge.ts)
   - Started but not finished — only organization tool registered
   - Need to complete all tool registrations (invoices, expenses, customers, bills, transactions, items, reports)
   - DefaultTransportWebsocket may not be the right transport for OpenClaw

3. **Token storage is in-memory only**
   - No persistence between runs
   - Device flow auth required every restart
   - Should add file-based storage (e.g., `~/.zoho-books/tokens.json` encrypted)

**High:**
4. **mcpServer.ts - ZohoBooksTools interface only, no implementation**
   - Defines the tool interface but no concrete implementation
   - Need actual service class that wraps ZohoClient calls
   - Tool response format needs validation (success/data/message wrapper)

5. **Error handling inconsistent**
   - ZohoClient has good auth error handling
   - But general API errors (4xx, 5xx) not explicitly caught/transformed
   - Should wrap all errors with context (which tool, which org, what params)

6. **No rate limit awareness at tool level**
   - Client does 650ms delay globally
   - But if a tool makes 5 sequential calls, that's 3.25s per tool invocation
   - Consider batching or caching for multi-call workflows

**Medium:**
7. **Organization selection logic**
   - Hardcoded to pick first org or use DEFAULT_ORGANIZATION_ID
   - Should allow per-call org override (currently injected globally)
   - Better: store list of orgs in token storage, let tools specify which one

8. **Report endpoint not fully typed**
   - `getBasicReports(reportName, params)` returns `any`
   - Should type report responses (P&L, Balance Sheet, Aging, etc.)

9. **No caching**
   - Repeated calls to `listCustomers()` or `listInvoices()` hit API every time
   - Consider 5-min in-memory cache for non-volatile data (customers, items)

10. **Config validation loose**
    - `ZOHO_REDIRECT_URI` marked optional but warned about (confusing)
    - Device flow is the only implemented auth — make that clear

### 📋 Testing Gaps
- No unit tests written
- No integration test with actual Zoho API
- No test fixtures for error scenarios (rate limit, auth failure, etc.)

### 📚 Documentation Status
- README.md: ✅ Complete and clear
- OPENCLAW-INTEGRATION.md: ✅ Complete with examples
- Code comments: ⚠️ Present but sparse (especially ZohoBooksTools interface)
- Types: ✅ Well-documented in types.ts

---

## Next Steps (Priority Order)

### Before Phase 2:
1. **Fix critical bugs**
   - Remove duplicate `return config` in zohoClient.ts (line 69)
   - Complete mcpServer.ts implementation (add ZohoBooksServiceImpl class)
   - Finish mcp-bridge.ts (register all tools)

2. **Add token persistence**
   - File-based storage in `~/.zoho-books/tokens.json`
   - Encrypt sensitive data (refresh_token at minimum)
   - Auto-load on startup if valid

3. **Improve error handling**
   - Wrap all Zoho API errors with context
   - Add retry logic for transient 5xx errors
   - Log all failures for debugging

4. **Allow org override per request**
   - Update all tool signatures to accept optional `organization_id`
   - Remove hardcoded org_id from token storage (use as default only)

5. **Add basic unit tests**
   - Mock ZohoClient for mcpServer tests
   - Test tool parameter validation
   - Test error conditions

### Phase 2 readiness:
- [ ] Token persistence working
- [ ] All tools tested end-to-end with real Zoho account
- [ ] Error messages user-friendly (not raw API errors)
- [ ] Rate limiting validated (no 429 responses under normal load)
