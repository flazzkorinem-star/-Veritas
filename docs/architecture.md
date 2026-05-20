# Veritas Architecture

Last synchronized: 2026-05-20

## Status

This document is archived as a detailed architecture reference for the old fixed-round V1 implementation.

Do not use it as the active product or implementation source while the project is being migrated to `docs/design-guide.md` v3.0.

Active references:

- `docs/design-guide.md` — product truth source.
- `docs/project-map.md` — current code navigation and v3.0 migration map.
- `AGENTS.md` — Agent rules and engineering constraints.
- `docs/operator-runbook.md` — run, test, deploy, and failure checks.

## Rewrite Trigger

Rewrite this document only after the v3.0 core flow is implemented end to end:

```text
upload material -> extract nodes -> level-based dialogue -> diagnostic report
```

Until then, keep architecture decisions in the smaller active documents above to avoid maintaining two competing sources of truth.
