# Codex Handoff

## Baseline

This repository is based on the latest Manus export received on 2026-06-03:

- Source archive: `ear-emg-demo-complete (2).tar.gz`
- Diagnostics archive: `ear-emg-demo-diagnostics.tar.gz`

The source package includes:

- `client/`
- `server/`
- `drizzle/`
- `shared/`
- `package.json`
- `pnpm-lock.yaml`
- `vite.config.ts`
- `tsconfig.json`
- `vitest.config.ts`

The diagnostics package reported:

- `pnpm test`: 36 test files passed, 542 tests passed
- `pnpm tsc --noEmit`: 0 TypeScript errors, 0 warnings, with one pnpm configuration warning

## Codex Adjustment

Codex made one additional consistency fix after importing the latest Manus source:

- `client/src/lib/db.ts`
  - When canonicalizing duplicate command records, the normalized command now always uses `key === name`.
  - This prevents legacy IndexedDB command keys from surviving after duplicate merge and reduces the chance of delete/continue-collection regressions.

## Current Focus Areas

The latest source includes fixes for the previously recurring issues:

- Unified IndexedDB schema via shared `DB_CONFIG`
- DB version upgraded to v6
- Cascading command deletion across command, recognition, feedback, and calibration stores
- Current-session recognition diagnostics including top score, second score, margin, channel weights, and channel diagnostics
- Confidence threshold unit handling using 0-100 score comparison
- Diagnostic export threshold handling using consistent 0-100 confidence units

## Local Notes

The local Codex environment currently does not have `pnpm` or `node_modules` available, so Codex has not rerun the test suite locally. The verification status above comes from the Manus diagnostics export.

