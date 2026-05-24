# Veritas Operator Runbook

Last synchronized: 2026-05-20

## Purpose

This file only covers running, testing, deploying, and basic failure checks. Product decisions live in `docs/design-guide.md`; code navigation lives in `docs/project-map.md`.

## Environment

Required `.env.local` keys:

```text
DEEPSEEK_API_KEY=<secret>
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL_FAST=<confirmed fast model>
LLM_MODEL_SMART=<confirmed smart model>
```

Do not print, commit, or rewrite `.env.local`.

Vercel Production environment variables are configured in Vercel, not committed files. `.vercelignore` excludes `.env` and `.env.*`.

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

Deploy Production:

```powershell
npx.cmd vercel --prod --yes
```

Production URL:

```text
https://veritas-red.vercel.app
```

## Verification Standard

- Documentation-only changes do not require tests.
- Code changes should run `npm run test:run`.
- Production readiness requires `npm run build`.
- In this Codex Windows environment, Vitest may fail in the sandbox with `spawn EPERM`. Rerun the same command with approved escalation; do not change project code around the sandbox.

## Smoke Test

Use for v3.0 regression checks.

1. Start the dev server.
2. Open `/exam` on the active dev-server origin, for example `http://localhost:3000/exam` or `http://127.0.0.1:3127/exam`.
3. Upload a small readable TXT or Markdown file first.
4. Confirm Agent 1 returns a concise knowledge-node list.
5. Confirm Agent 2 advances by cognitive level, not fixed answer count.
6. Confirm the hint and answer actions work.
7. Confirm the report cites user wording and shows level status.
8. Repeat with small PDF, DOCX, and PPTX files.

## Failure Checks

- If analysis returns no nodes, inspect `lib/agents/analyzer.ts` and source text extraction in `lib/pdf.ts`.
- If a node lacks evidence, inspect Agent 1 parsing and validation.
- If dialogue does not advance by cognitive level, inspect Agent 2 `nextAction` handling in `app/exam/page.tsx`, `store/examStore.tsx`, and `/api/question`.
- If prompts or answers behave like static content, inspect Agent 2 action handling and cache logic.
- If scores do not match quick-path level status, inspect `lib/score.ts`.
- If the frontend shows raw JSON parse errors, inspect `lib/apiResponse.ts` and the failing API route logs.
- If PDF parsing fails only on Vercel with `DOMMatrix is not defined`, verify `@napi-rs/canvas` remains a direct dependency.
- If file parsing fails for a specific document, verify extension, MIME type, size limit, and extractable text. Image-only files, scans, and embedded chart text are not recognized in the current scope.
