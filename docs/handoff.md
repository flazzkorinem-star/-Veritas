# Veritas Handoff

Last synchronized: 2026-05-20

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

## Recommended Parallel Work

### Window A: Data Structure And Flow Base

Owns:

- `lib/types.ts`
- `lib/examFlow.ts`
- `lib/score.ts`
- `tests/lib/examFlow.test.ts`
- `tests/lib/score.test.ts`

Goal:

- Add v3.0 types such as `CognitiveLevel`, `LevelStatus`, level state, support records, and richer `QuestionResponse`.
- Keep old fields compatible during the first pass.
- Add pure helpers for level-based progression.
- Change scoring to quick-path levels: memory 33, understanding 33, application 34.

Avoid:

- Agent files.
- API routes.
- UI pages.
- `store/examStore.tsx`.

### Window B: Agent 1 Analyzer

Owns:

- `lib/agents/analyzer.ts`
- `tests/lib/analyzer.test.ts`

Goal:

- Agent 1 extracts high-diagnostic-value nodes, not a broad summary.
- Return at most 8 nodes.
- Allow fewer nodes for short material.
- Preserve evidence excerpt, suitable levels, and priority reason.
- Validate model output defensively.

Avoid:

- Editing `lib/types.ts`; ask Window A to add missing types.
- Touching Agent 2, Agent 3, API routes, or UI.

## After Windows A And B Finish

Next sequence:

1. Integrate new types into `store/examStore.tsx`.
2. Update `/api/analyze` to return the new Agent 1 node shape.
3. Update Agent 2 and `/api/question` to return natural reply plus structured level state.
4. Replace fixed 3-round client flow in `app/exam/page.tsx` with level-based progression.
5. Update Agent 3 and `/api/evaluate` for level-status reports.
6. Update `lib/score.ts` integration and report display.
7. Only then start the three-column workspace UI.
8. Add local history after the core diagnostic flow works.

## Guardrails

- Keep changes small and file-scoped.
- Do not rewrite the whole UI first.
- Do not add account systems, cloud sync, real RAG, OCR, image understanding, knowledge graphs, gamification, or multiple-choice main flow.
- Do not modify `.env.local`, DeepSeek provider, or model names.
- Run relevant tests after code changes.
