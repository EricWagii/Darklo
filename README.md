# Darklo Ear EMG Demo

Darklo is a browser-based ear EMG silent input training and recognition demo. It includes a React frontend, an Express backend, shared TypeScript models, local IndexedDB storage, waveform processing, recognition diagnostics, and test coverage for the EMG data workflow.

## Project Structure

```text
client/       React frontend and browser-side EMG logic
server/       Express backend and server-side tests
shared/       Shared constants and TypeScript types
drizzle/      Database schema/migrations
docs/         Codex handoff and validation notes
```

## Development

```bash
pnpm install
pnpm dev
```

## Verification

```bash
pnpm test
pnpm tsc --noEmit
```

Latest Manus-provided diagnostics reported:

- `542/542` tests passed
- TypeScript check completed with `0` errors and `0` warnings, aside from a pnpm configuration warning

See [docs/CODEX_HANDOFF.md](docs/CODEX_HANDOFF.md) for the current Codex handoff status.

