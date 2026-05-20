# Veritas Handoff

Last synchronized: 2026-05-21 (`/api/analyze` aligned with Agent 1 v3.0)

## Current Baseline

Product truth source: `docs/design-guide.md` v3.0.

Current implementation still resembles the old fixed-round V1 flow. The next development phase should migrate the code toward:

```text
upload material -> extract high-value nodes -> level-based dialogue -> diagnostic report
```

Do not delete the old code base. Reuse the existing file parsing, LLM wrapper, API error handling, tests, and deployment setup.

## Completed Documentation Sync

- `docs/design-guide.md` — updated to v3.0 product direction.
- `AGENTS.md` — updated with v3.0 Agent rules and engineering constraints.
- `docs/project-map.md` — updated as the current code navigation and migration map.
- `README.md` — updated for public-facing v3.0 direction.
- `docs/operator-runbook.md` — reduced to run, test, deploy, and failure checks.
- `docs/architecture.md` — archived until the v3.0 core flow is implemented.

## Completed Code Work

- Window A data structure and flow base is complete in `lib/types.ts`, `lib/examFlow.ts`, `lib/score.ts`, `tests/lib/examFlow.test.ts`, and `tests/lib/score.test.ts`.
- The first slice adds v3.0 cognitive-level types, support records, richer `QuestionResponse`, pure level-flow helpers, and quick-path scoring.
- That first slice intentionally did not connect the new flow to Agent files, API routes, UI pages, or `store/examStore.tsx`.
- Window B Agent 1 analyzer is complete in `lib/agents/analyzer.ts` and `tests/lib/analyzer.test.ts`: at most 8 nodes, fewer allowed for short material, evidence/suitableLevels/priorityReason validated defensively, and `suitableLevels` now uses the shared English `CognitiveLevel` from `lib/types.ts` (no more local Chinese duplicate).
- Store state integration is complete in `store/examStore.tsx` and `tests/store/examStore.test.ts`: it keeps old fields (`currentQuestion`, `currentNodeIndex`, `nodeConversations`) for page compatibility while adding current node, current level, per-node level state, quick/deep path state, Agent 2 structured response, report status, and support records attached to `NodeLevelState.supportRecords`. `getDialogueStatus` derives dialogue status from the current Agent 2 response instead of storing duplicate state.
- `/api/analyze` integration is complete in `app/api/analyze/route.ts` and `tests/app/analyzeRoute.test.ts`: the route remains a thin file-parse + Agent 1 forwarding layer and returns the v3.0 node shape (`id`, `name`, `context`, `sourceExcerpt`, `suitableLevels`, `priorityReason`) to the frontend. Node quality validation stays in `lib/agents/analyzer.ts`.

## Next Up

1. Update Agent 2 and `/api/question` to return natural reply plus structured level state.
2. Replace fixed 3-round client flow in `app/exam/page.tsx` with level-based progression backed by the store.
3. Update Agent 3 and `/api/evaluate` for level-status reports.
4. Update `lib/score.ts` integration and report display.
5. Only then start the three-column workspace UI.
6. Add local history after the core diagnostic flow works.

## Guardrails

- Keep changes small and file-scoped.
- Do not rewrite the whole UI first.
- Do not add account systems, cloud sync, real RAG, OCR, image understanding, knowledge graphs, gamification, or multiple-choice main flow.
- Do not modify `.env.local`, DeepSeek provider, or model names.
- Run relevant tests after code changes.
