# PhotoNest

**Repository:** https://github.com/vidarbrekke/photonest
**Live URL:** photonest.ai
**Status:** Pre-monetization
**Blocker:** Needs video demonstrating app flow for Google Photos write access approval

---

<quick_reference>
- **Stack:** Next.js 15.5.3 (App Router), React 19, TypeScript strict, Zustand 5.0.8
- **Backend:** Firebase 10.12.2 (Auth, Firestore, Storage, Hosting)
- **Processing:** OpenCV.js (WASM worker), TensorFlow.js (face detection)
- **Testing:** Vitest (unit), Playwright (E2E)
- **Dev command:** `npm run fresh` (**NEVER** `npm run dev`)
- **Production:** photonest-e9007.web.app
</quick_reference>

<constraints>
- DO NOT use `npm run dev` — cache corrupts env vars; always `npm run fresh`
- DO NOT change package versions without explicit permission
- DO NOT modify COEP/COOP headers without testing `/demo` route
- DO NOT revoke ObjectURLs without tracing all references first
- DO NOT lazy-load Zustand slices (causes sync issues)
- DO NOT assume TypeScript processors in `lib/workers/` are active (they're not yet)
</constraints>

---

## Essential Commands

```bash
npm run fresh           # Dev server (USE THIS)
npm run fresh:build     # Production build
npm test                # Unit tests
npm run test:e2e -- --project=chromium  # E2E tests
npm run type-check      # TypeScript validation
```

## Key Files

| What | Where |
|------|-------|
| Zustand store (7 slices) | `lib/store/appStore.ts` |
| TypeScript processors (unused) | `lib/workers/worker/processors/` |
| Legacy processor (active) | `public/opencv-enhancement-worker.js` |
| OAuth callback | `app/api/oauth/google/callback/route.ts` |

---

## Architecture Notes

### Image Processing (Current State)
- 10 TypeScript processors exist in `lib/workers/worker/processors/` — **NOT integrated**
- Legacy code in `public/opencv-enhancement-worker.js` does ALL processing
- Worker is lazy-loaded after first image upload
- Mat objects must be explicitly deleted (memory leak if not)

### State Management
- Zustand with 7 slices: `toast, ui, file, processingSettings, opencv, googlePhotos, imageProcessing`
- Slices use EAGER initialization (lazy loading caused sync issues)

---

## Pitfalls (Real Production Bugs)

### 1. ObjectURL Lifecycle (Critical)
**Problem:** ObjectURLs are pointers, not copies. Revoking one breaks ALL references.
**Symptom:** Image disappears after reprocessing.
**Rule:** Never revoke until 100% sure nothing references them.
**Note:** PDRE (auto color) requires Data URLs, not blob URLs.

### 2. Build Cache Corrupts Env Vars
**Problem:** Next.js caches `NEXT_PUBLIC_*` in `.next/static/chunks/*.js`. Old Firebase project IDs leak.
**Solution:** Always use `npm run fresh` which clears cache first.

### 3. Localhost Auth
**Problem:** Google Sign-In fails locally with `redirect_uri_mismatch`.
**Workaround:** Test auth on production URL only.

### 4. OpenCV Worker Headers
**Problem:** WASM needs COEP/COOP headers, but they break some features.
**Solution:** COEP headers disabled on `/demo` route.

### 5. TypeScript Env Access
**Problem:** `process.env.VAR` can error in strict mode.
**Solution:** Use bracket notation: `process.env['VAR']`

---

## Processing Settings

### Vintage Photo Constraints
```
cleanupStrength ≤ 10    (preserve grain/character)
enhanceStrength ≤ 25    (avoid over-processing)
```

### Auto Color + Levels Interaction
Auto Color adds ~5% brightness → Levels must compensate by reducing gamma
