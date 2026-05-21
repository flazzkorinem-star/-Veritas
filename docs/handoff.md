# Veritas Handoff

Last synchronized: 2026-05-21 (v3.0 Agent flow safeguards synced)

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
- Window B Agent 1 analyzer is complete in `lib/agents/analyzer.ts` and `tests/lib/analyzer.test.ts`: at most 8 nodes, fewer allowed for short material, evidence/suitableLevels/priorityReason validated defensively, and `suitableLevels` now uses the shared English `CognitiveLevel` from `lib/types.ts` (no more local Chinese duplicate). Non-contiguous `suitableLevels` are normalized into a continuous path from `memory` to the highest suitable level.
- Store state integration is complete in `store/examStore.tsx` and `tests/store/examStore.test.ts`: it keeps old fields (`currentQuestion`, `currentNodeIndex`, `nodeConversations`) for page compatibility while adding current node, current level, per-node level state, quick/deep path state, Agent 2 structured response, report status, and support records attached to `NodeLevelState.supportRecords`. `getDialogueStatus` derives dialogue status from the current Agent 2 response instead of storing duplicate state.
- `/api/analyze` integration is complete in `app/api/analyze/route.ts` and `tests/app/analyzeRoute.test.ts`: the route remains a thin file-parse + Agent 1 forwarding layer and returns the v3.0 node shape (`id`, `name`, `context`, `sourceExcerpt`, `suitableLevels`, `priorityReason`) to the frontend. Node quality validation stays in `lib/agents/analyzer.ts`.
- `/api/question` and Agent 2 are connected in `app/api/question/route.ts`, `lib/agents/questioner.ts`, and `tests/lib/questioner.test.ts`: Agent 2 returns natural replies plus structured level state, normal/hint/answer are distinguished, malformed output falls back safely, and model-provided pass status is ignored unless there is a real user answer.
- `/exam` level-based client flow is complete in `app/exam/page.tsx`, `lib/examFlow.ts`, `store/examStore.tsx`, and `tests/lib/examFlow.test.ts`: the page uses Agent 2 `nextAction` instead of fixed answer counts, waits for the quick-path complete/deep-dive choice, wires hint/answer requests through `/api/question`, and blocks empty answer submission. Deep path currently auto-covers analysis/evaluation only; creation is not entered automatically.
- Agent 3 and report scoring are connected in `app/api/evaluate/route.ts`, `lib/agents/evaluator.ts`, `lib/score.ts`, `components/ReportCard.tsx`, and related tests: reports use local quick-path scoring, filter unsupported or synthetic user quotes, carry support records, and display v3.0 report fields.

## Next Up

1. Start the three-column workspace UI.
2. Add local history after the core diagnostic flow works.
3. If creation-layer diagnosis is needed, design an explicit entry instead of auto-entering it after evaluation.
4. Clean up old compatibility fields such as `QuestionResponse.question` / `levelPassed` after page migration is complete.

## Guardrails

- Keep changes small and file-scoped.
- Do not rewrite the whole UI first.
- Do not add account systems, cloud sync, real RAG, OCR, image understanding, knowledge graphs, gamification, or multiple-choice main flow.
- Do not modify `.env.local`, DeepSeek provider, or model names.
- Run relevant tests after code changes.
