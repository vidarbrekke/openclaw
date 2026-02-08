# AI Judge Implementation Brief

**Project:** TuneTussle  
**Feature:** AI Judge Commentary  
**Status:** Ready for Implementation  
**Date:** February 2, 2026

---

## Overview

The AI Judge service (`aiJudgeService.ts`) exists but is completely disconnected from gameplay. This brief provides requirements for wiring it into the game flow.

---

## Current State

### What Exists
- `backend/src/services/aiJudgeService.ts` - 240 lines, generates commentary via OpenRouter API
- `GameSession.useAIJudge` boolean field (currently always `false`)
- `AI_JUDGE_COMMENTARY` socket event defined but unused

### What's Missing
- [ ] UI toggle on Create Game page
- [ ] Backend logic to call `generateJudgeCommentary()`
- [ ] Socket emission to clients
- [ ] Frontend rendering of commentary

---

## Requirements

### 1. Create Game UI (Frontend)

**Location:** CreateGamePage or game setup flow

**Add:**
- Toggle switch: "🎮 Use AI Judge" 
- Subtext: "Adds AI-generated commentary to answer reveals (costs ~$0.001 per round)"
- Default state: **OFF** (opt-in only)

**Data flow:**
```typescript
// Include in game creation payload
createGame({
  // ... existing fields
  useAIJudge: boolean;  // new field
});
```

---

### 2. Game Session Persistence (Backend)

**Location:** `gameLifecycleService.ts` or game creation flow

**Modify:**
- Accept `useAIJudge` from creation payload
- Store in `GameSession.useAIJudge` (already exists in types)
- Default to `false` if not provided

---

### 3. Answer Evaluation Integration (Backend)

**Location:** `answerSubmissionService.ts` or `registerClientEventHandlers.ts`

**Current flow:**
```
receive answer → evaluateAnswer() → emit answerSubmitted
```

**New flow:**
```
receive answer → evaluateAnswer() → emit answerSubmitted → [if useAIJudge] fetch AI commentary → emit AI_JUDGE_COMMENTARY
```

**Critical requirement:** Non-blocking async

```typescript
// BAD - blocks game flow
const commentary = await generateJudgeCommentary(...);  // DON'T DO THIS

// GOOD - async, non-blocking
evaluateAndEmitAnswer();
if (gameSession.useAIJudge) {
  generateJudgeCommentary(...).then(commentary => {
    emitAIJudgeCommentary(gameCode, commentary);
  }).catch(err => {
    console.error('AI Judge failed:', err);
    // Don't emit - game continues fine without it
  });
}
```

**Implementation details:**
- Call `generateJudgeCommentary(playerName, answer, correctAnswer, evaluation)`
- Pass the `EvaluateAnswerResponse` from `evaluateAnswer()`
- Emit new event `AI_JUDGE_COMMENTARY` to all clients in game

---

### 4. Socket Event (Backend → Frontend)

**Event name:** `AI_JUDGE_COMMENTARY` (already exists in shared/socketEvents.ts)

**Payload:**
```typescript
{
  gameCode: string;
  roundId: string;
  playerName: string;
  commentary: string;      // AI-generated text
  isCorrect: boolean;      // Whether answer was correct
  scoreAwarded: number;
}
```

---

### 5. Frontend Rendering

**Listen for:** `AI_JUDGE_COMMENTARY` event

**UI placement:** 
- Results page / answer reveal screen
- Below or replace basic feedback message
- Distinct styling to show it's "the judge speaking"

**UX considerations:**
- Show placeholder text while waiting: "🎤 The judge is deliberating..."
- Animate in commentary when received (400-800ms slide/fade)
- If AI fails (event never arrives), fallback to basic feedback already shown

**Design suggestion:**
```
┌─────────────────────────────────┐
│  🎤 THE JUDGE SPEAKS            │
│                                 │
│  "Sorry Sarah, that's           │
│   incorrect! The correct        │
│   answer was 'Bohemian          │
│   Rhapsody' by Queen."          │
│                                 │
│  Score: 0 points                │
└─────────────────────────────────┘
```

---

## API & Cost Considerations

### OpenRouter Integration
- Model: `x-ai/grok-3-mini` (configurable via `AI_JUDGE_MODEL_ID`)
- Cost: ~$0.60 per million tokens
- Estimated per-commentary: 200-400 tokens = ~$0.0001-0.0002
- 1000 rounds = ~$0.10-0.20

### Environment Variables Required
```
OPENROUTER_API_KEY=sk-or-v1-...
AI_JUDGE_MODEL_ID=x-ai/grok-3-mini  # optional, defaults to grok-3-mini
```

### Fallback Behavior
If `OPENROUTER_API_KEY` is missing or API fails:
- `aiJudgeService.ts` already has `generateFallbackCommentary()`
- Returns basic commentary without AI
- Game continues normally

---

## Testing Checklist

- [ ] Toggle appears on Create Game page
- [ ] Toggle defaults to OFF
- [ ] When OFF, no AI commentary emitted (existing behavior)
- [ ] When ON, AI commentary emitted after answer
- [ ] Commentary renders in UI with appropriate styling
- [ ] Multiple rapid answers don't cause race conditions
- [ ] AI API failure doesn't break game flow
- [ ] Missing API key gracefully degrades to fallback

---

## Implementation Notes

### Existing Code to Reference
- `backend/src/services/aiJudgeService.ts` - Ready to use
- `backend/src/services/answerSubmissionService.ts` - Where to integrate
- `shared/socketEvents.ts` - Event constants
- `frontend/src/types/gameTypes.ts` - Type definitions

### Key Function Signatures
```typescript
// aiJudgeService.ts
export async function generateJudgeCommentary(
  playerName: string,
  answer: { songTitle: string; artist: string },
  correctAnswer: { title: string; artist: string },
  evaluation: EvaluateAnswerResponse
): Promise<AIJudgeEvaluation>;

// Types
export interface AIJudgeEvaluation {
  commentary: string;
  isCorrect: boolean;
  scoreAwarded: number;
}
```

---

## Questions for Developer

1. **Cost threshold:** Should we add a per-game cost limit? (e.g., max $1.00 AI cost per game)
2. **Caching:** Should identical answers reuse commentary to reduce API calls?
3. **Voice:** Want to adjust the personality/prompt? Current is "charismatic gameshow host"

---

## Acceptance Criteria

- [ ] User can enable AI Judge when creating a game
- [ ] AI commentary appears after each answer evaluation
- [ ] Commentary is entertaining and contextually appropriate
- [ ] Game performance is not degraded (non-blocking)
- [ ] Feature works with or without valid OpenRouter key (graceful fallback)
- [ ] All existing tests pass
- [ ] New tests added for AI judge flow

---

**Contact:** Vidar for questions on UX priority or OpenRouter account setup
