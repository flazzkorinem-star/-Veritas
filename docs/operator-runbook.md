# Veritas Operator Runbook

Last synchronized: 2026-07-28

## Purpose

This file only covers running, testing, and basic failure checks. Product decisions live in `docs/design-guide.md`; code navigation lives in `docs/project-map.md`.

## Environment

Required `.env.local` keys:

```text
DEEPSEEK_API_KEY=<secret>
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL_FAST=<confirmed fast model>
```

Do not print, commit, or rewrite `.env.local`.

## Commands

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Run tests:

```bash
npm run test:run
```

Run production build:

```bash
npm run build
```

Windows equivalents:

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run test:run
npm.cmd run build
```

If Windows reserves the default Next.js port:

```powershell
npm.cmd run dev -- --port 3127 --hostname 127.0.0.1
```

## Verification Standard

- Documentation-only changes do not require tests.
- Code changes should run `npm run test:run`.
- Production readiness requires `npm run build`.
- In this Codex Windows environment, Vitest may fail in the sandbox with `spawn EPERM`. Rerun the same command with approved escalation; do not change project code around the sandbox.

## Smoke Test

Use for v3.3 regression checks.

1. Start the dev server.
2. Open the bookshelf at `/` on the active dev-server origin, for example `http://localhost:3000/` or `http://127.0.0.1:3127/`.
3. Upload one or more small readable TXT or Markdown files; while parsing, confirm the current file, processed-file count, and animated progress feedback are visible, then confirm each successful file becomes a separate bookshelf card.
4. Confirm each card shows the material name, knowledge-point count, and diagnosis progress; reopen a card to enter `/exam`.
5. Confirm Agent 1 returns 1–15 worthwhile nodes grouped by importance in the knowledge map.
6. Confirm bookshelf materials, workspace materials, and knowledge nodes rename through in-page dialogs; confirm the importance dialog offers all three levels, marks the current level, and does not switch nodes when a level is selected.
7. Confirm Agent 2 advances by cognitive level, not fixed answer count.
8. Confirm the hint and answer actions work.
9. Confirm the report cites user wording and shows level status.
10. Return to the bookshelf and confirm the material and diagnosis progress can be reopened, then repeat with small PDF, DOCX, and PPTX files.

## Failure Checks

- If analysis returns no nodes, inspect `lib/agents/analyzer.ts` and source text extraction in `lib/pdf.ts`.
- If bookshelf records fail to load, save, or reopen, inspect `app/_hooks/useMaterialLibrary.ts`, `app/_lib/materialLibrary.ts`, and `lib/localHistory.ts`.
- If a node lacks evidence, inspect Agent 1 parsing and validation.
- If dialogue does not advance by cognitive level, inspect `nextAction` derivation in `lib/agents/questioner.ts` (via `lib/examFlow.ts`), then `app/exam/_lib/questionFlowTransitions.ts`, `store/examReducer.ts`, and `/api/question`.
- If switching knowledge points causes responses to appear in the wrong dialogue, inspect `nodeId`-targeted writes in `app/exam/_hooks/useQuestionFlow.ts`, `store/examReducer.ts`, and `lib/examFlow.ts`.
- If prompts or answers behave like static content, inspect Agent 2 action handling and cache logic.
- If scores do not match quick-path level status, inspect `lib/score.ts`.
- If the frontend shows raw JSON parse errors, inspect `lib/apiResponse.ts` and the failing API route logs.
- If PDF parsing fails with `DOMMatrix is not defined`, verify `@napi-rs/canvas` remains a direct dependency and `lib/pdf.ts` still installs the PDF globals.
- If file parsing fails for a specific document, verify extension, MIME type, size limit, and extractable text. Image-only files, scans, and embedded chart text are not recognized in the current scope.
