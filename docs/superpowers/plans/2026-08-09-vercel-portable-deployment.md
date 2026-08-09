# Vercel Portable Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the complete EMG acquisition and recognition UI to a public HTTPS URL without requiring the Manus backend or a server database.

**Architecture:** Keep the existing server-backed authentication path for normal development, and select a browser-local IndexedDB authentication adapter only when `VITE_PORTABLE_MODE=true`. Build the Vite client as a static SPA for Vercel while retaining all serial, IndexedDB, export, recognition, and continuous-code behavior.

**Tech Stack:** React 19, Vite 7, IndexedDB, Web Serial, Vitest, Vercel static hosting.

---

### Task 1: Portable runtime primitives

**Files:**
- Create: `client/src/lib/portable-runtime.ts`
- Test: `server/portable-runtime.test.ts`

- [x] Add failing tests for explicit mode selection, stable local user IDs, and account-to-session mapping.
- [x] Run `vitest run server/portable-runtime.test.ts` and verify the missing module failure.
- [x] Implement pure runtime and account mapping helpers.
- [x] Run the focused test and verify it passes.

### Task 2: Dual authentication provider

**Files:**
- Modify: `client/src/contexts/UserSessionContext.tsx`

- [x] Preserve the existing tRPC provider as `ServerUserSessionProvider`.
- [x] Add `PortableUserSessionProvider` that dynamically uses `loginUser` and `registerUser` from browser IndexedDB.
- [x] Select the provider with `VITE_PORTABLE_MODE` without conditionally invoking React hooks.
- [x] Run TypeScript and authentication tests.

### Task 3: Static production build

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `vercel.json`

- [x] Add `build:portable` using `VITE_PORTABLE_MODE=true vite build`.
- [x] Exclude Manus runtime plugins from portable production builds.
- [x] Configure Vercel output as `dist/public` with SPA rewrites and serial permissions headers.
- [x] Run a clean portable production build.

### Task 4: End-to-end verification

**Files:**
- Modify: `README.md`

- [x] Document local preview, Vercel import settings, browser-local data boundaries, and Web Serial requirements.
- [x] Run 609 tests, TypeScript, and the portable build.
- [x] Inspect generated `dist/public/index.html` and verify the continuous-code route in a production preview.
- [ ] Commit and push `codex/vercel-portable` for one-click Vercel import.
