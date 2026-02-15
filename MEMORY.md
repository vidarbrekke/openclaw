# MEMORY.md - Long-Term Memory

## SharePoint Download - Direct File URLs Work

**Date:** 2026-02-14

### Discovery
SharePoint INDIVIDUAL file downloads ARE automatable via direct server-relative URLs + authenticated cookies.

### The Failing Approach
- Folder downloads via `transform/zip` endpoint return 0 bytes
- This endpoint initiates async job but doesn't directly serve files
- Native Playwright `waitfordownload` fails on folder downloads

### The Working Solution
Direct file access pattern:
```
https://<tenant>.sharepoint.com/<server-relative-path-to-file>
```

Example:
```
https://sandnesgarn.sharepoint.com/sites/SandnesGarn/Forhandler%20Arkiv/Nettside%20forhandler%20arkiv/Bildearkiv%20%28picture%20archive%29/Garn%20%28yarn%29/Alpakka%20F%C3%B8lgetr%C3%A5d/N%C3%B8stebilder%20%28skein%20pictures%29/11557911_Mint-green_300dpi_Close-up.jpg
```

### Implementation
Use background download job with cookies:
```bash
# 1. Export cookies from active browser session
openclaw browser --json cookies --browser-profile openclaw --target-id <id> > cookies.json

# 2. Build cookie header (helper script fixed 2026-02-14)
/Users/vidarbrekke/Dev/CursorApps/clawd/scripts/openclaw-cookie-header-from-json.sh \
  --input cookies.json --domain sharepoint.com --raw > cookie-header.txt

# 3. Start background download job
COOKIE_HEADER=$(cat cookie-header.txt)
/Users/vidarbrekke/Dev/CursorApps/clawd/scripts/openclaw-download-job.sh \
  --url "https://sandnesgarn.sharepoint.com/..." \
  --output "/tmp/openclaw/downloads/filename.jpg" \
  --cookie-header "$COOKIE_HEADER"

# 4. Poll for completion
/Users/vidarbrekke/Dev/CursorApps/clawd/scripts/openclaw-download-job-status.sh \
  --job-id <JOB_ID> --tail 10
```

### Success Criteria
- `STATUS=succeeded`
- `EXIT_CODE=0`
- `SIZE_BYTES > 0` (typically 500KB-800KB for images)

### Critical Lessons
1. Don't declare "impossible" after one failed approach
2. SharePoint folder downloads ≠ individual file downloads
3. Direct file URLs work with proper authentication cookies
4. Background jobs + polling avoid gateway timeout issues

---

## Swatch Automation - COMPLETE ✅

**When user asks:** "swatch automation", "Sandnes Garn swatches", "Mother Knitter missing swatches", "automate product images"

**Date:** 2026-02-15  
**Status:** ✅ PRODUCTION COMPLETE - 29 swatches automated  
**Project:** `sandnes-swatch-automation/` (git-managed)

### Quick Reference
- **Location:** `/Users/vidarbrekke/Dev/CursorApps/clawd/sandnes-swatch-automation`
- **Run:** `./run-swatch.sh wholesale` or `./run-swatch.sh prod`
- **Safe test:** `./run-swatch.sh wholesale --dry-run` (download + process only, no uploads/SSH)
- **Docs:** `sandnes-swatch-automation/README.md` and `docs/SWATCH_RUNBOOK.md`

### Features
- Auto-validates env vars and cookie file at startup (exits with clear errors if missing)
- Fuzzy color name matching (handles "Mint Green" → "Mint", "Rain Forest" → "Rainforest")
- Handles SharePoint folder structure variations per product
- Dry-run mode for testing without making changes

### Final Results
- **Wholesale:** 18 swatches (82 → 64 missing)
- **Production:** 11 swatches (2,324 → 2,313 missing)  
- **Total:** 29 swatches automated

**See project NOTES.md for complete technical details.**

---

## Browser Control Service - Critical Fix

**Date:** 2026-02-13

### Problem
Browser actions (`open`, `snapshot`, `act`) consistently failed with "Chrome extension relay is running, but no tab is connected" error, even when explicitly requesting `profile="openclaw"`.

### Root Cause
The browser control service maintains persistent profile state. It was locked in `profile="chrome"` (chrome extension relay mode) and not running. All browser actions inherited this incorrect profile unless explicitly overridden.

### Solution Pattern (ALWAYS USE THIS)

```bash
# Step 1: Check current browser state
browser({ action: "status" })

# Step 2: Explicitly start browser with desired profile
browser({ action: "start", profile: "openclaw" })

# Step 3: Pass profile parameter in EVERY browser action
browser({ 
  action: "open", 
  profile: "openclaw",  # ← CRITICAL: Must include in every call
  targetUrl: "..." 
})

browser({ 
  action: "snapshot", 
  profile: "openclaw",  # ← CRITICAL: Must include in every call
  targetId: "...",
  interactive: true
})

browser({ 
  action: "act", 
  profile: "openclaw",  # ← CRITICAL: Must include in every call
  targetId: "...",
  request: {...}
})
```

### Key Rules
1. **Always check `browser status` first** to identify current profile state
2. **Explicitly start** the browser with `profile="openclaw"` before operations
3. **Include `profile="openclaw"` in every single browser action** - the profile doesn't persist across actions
4. **Never assume profile inheritance** - each action must specify the profile
5. If browser fails, run `browser stop` then `browser start` with correct profile

### Why This Matters
- The browser service has service-level state that persists across commands
- Each action can override the service profile, but defaults to service state if omitted
- The "openclaw" profile uses an isolated Playwright-managed Chrome instance
- The "chrome" profile expects manual Chrome extension relay attachment

### Verification
After `browser start`:
- `status.profile` should show `"openclaw"`
- `status.running` should be `true`
- `status.cdpReady` should be `true`
