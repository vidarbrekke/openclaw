# TuneTussle

**Repository:** https://github.com/vidarbrekke/tunetussle
**Live URL:** tunetussle.com
**Status:** Pre-monetization

---

<quick_reference>
- **Stack:** React 18 + Vite + Vitest (frontend) | Node.js + Express + Jest + Socket.IO (backend) | TypeScript
- **Production:** Alpine Linux (1GB RAM) — builds must happen OFF-server
- **Init system:** OpenRC, not systemd (`rc-service tunetussle restart`)
- **External APIs:** Deezer → Spotify → YouTube (music fallback) | OpenRouter LLM (`grok-4.1-fast` → `grok-3-mini`)
</quick_reference>

<constraints>
- DO NOT build on server — not enough RAM (use CI or local)
- DO NOT change package.json versions/scripts without permission
- DO NOT modify .env, CI workflows, or deployment scripts without permission
</constraints>

---

## Essential Commands

```bash
npm run type-check && npm run test:all && npm run ci:local
```

## Key Files

| What | Where |
|------|-------|
| Main game state hook | `frontend/src/hooks/useSimpleGameLogic.ts` |
| All socket handlers | `backend/src/registerClientEventHandlers.ts` |
| Player persistence | `frontend/src/utils/playerStorage.ts` |
| LLM + fallback logic | `backend/src/services/llmService.ts` |
| Socket events enum | `shared/socketEvents.ts` |
| Test utilities | `*/testUtils/` directories |

---

## Pitfalls (Real Production Bugs)

### Express Routes Are Relative to Mount Point
```typescript
// ❌ Router mounted at /api → this becomes /api/api/llm-test
router.post('/api/llm-test', handler)

// ✅ Correct
router.post('/llm-test', handler)
```

### Socket.data Lost on Reconnection
```typescript
// ❌ socket.data.playerName is UNDEFINED after reconnect
// ✅ Always restore from gameSession using restoreSocketDataFromGame()
```

### Finished Games: Use Global Broadcast
```typescript
// ❌ Players have left room after game ends
io.to(gameCode).emit('judgeCreatingGame', data)

// ✅ Use global emit for post-game events
io.emit('judgeCreatingGame', { judgeName, previousGameCode })
```

### Buzzer State in isMusicPlaying
```typescript
// ❌ Turntable keeps spinning after wrong answer
isMusicPlaying={!!currentSongAudioUrl && !isRoundComplete}

// ✅ Include isBuzzActive
isMusicPlaying={!!currentSongAudioUrl && !isRoundComplete && isBuzzActive}
```

### Player Name Pre-fill
```typescript
// ❌ Pre-fills name from old game (confusing)
const name = playerStorage.getPlayerName()

// ✅ Only pre-fill if same game
if (storedData.gameCode === currentGameCode) { /* safe */ }
```

### Mobile: Both Touch and Click
```typescript
// ❌ Fails on iOS/Android
<button onClick={handleBuzz}>

// ✅ Required
<button onClick={handleBuzz} onTouchStart={handleBuzz} style={{ touchAction: 'manipulation' }}>
```

### Case-Insensitive Name Matching
```typescript
// ❌ "John" !== "john" breaks participant tracking
// ✅ Always use .toLowerCase() for name comparisons
```

---

## Timeout Architecture (Don't Change Without Reason)

| Layer | Timeout | Why |
|-------|---------|-----|
| LLM fetch | 45s | AbortController, leaves room for enrichment |
| Song enrichment | 40s | Parallel processing with Promise.all |
| Frontend total | 90s | 45 + 40 + buffer |

## Socket Event Order

```
Wrong Answer: answerSubmitted → buzzerStatusUpdate(false) → judge restarts → resumeRound → buzzerStatusUpdate(true)
Post-Game: gameOver → judgeCreatingGame (global) → judgeNewGame (global) → players redirect
```

Always emit to room before specific socket. Retrieve participant list before cleanup.

---

## Vitest-Specific

```typescript
// ❌ CI error: "vi.importOriginal is not a function"
const actual = await vi.importOriginal('../module')
// ✅ Correct
const actual = await vi.importActual('../module')

// ❌ CI error: "Cannot access before initialization"
// ✅ Use vi.hoisted() for complex mocks
const { mockHook } = vi.hoisted(() => ({ mockHook: vi.fn() }))
```

Use `frontend/src/testUtils/` and `backend/src/testUtils/` — don't duplicate mock setup.
