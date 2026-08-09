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

## Portable HTTPS deployment

The portable build runs serial acquisition, recognition, continuous EMG code
input, diagnostics, and account authentication entirely in the browser. It does
not require the Manus backend or `DATABASE_URL`.

```bash
pnpm run build:portable
pnpm exec vite preview
```

The generated static site is written to `dist/public`. To publish it on Vercel:

1. Import the GitHub repository into Vercel.
2. Select the branch `codex/vercel-portable` as the production branch.
3. Keep the repository root as the project root; `vercel.json` supplies the
   build command and output directory.
4. Deploy and open the generated HTTPS URL in current desktop Chrome or Edge.

Accounts, EMG collections, baselines, and recognition results remain in the
current browser's IndexedDB. They do not automatically synchronize between
computers. Use the application's export and import functions when moving a
dataset, and do not use private/incognito windows for acquisition sessions.
Portable deployments never embed or auto-provision an administrator password;
operators create an ordinary browser-local account from the login screen.

Each computer must grant serial-port permission after the operator clicks the
hardware connection control. The STM32 must be physically connected to the
computer running the browser.

## Verification

```bash
pnpm test
pnpm tsc --noEmit
```

Latest portable-build verification reported:

- `609/609` tests passed across 50 test files
- TypeScript check completed with `0` errors
- Portable production build completed successfully

See [docs/CODEX_HANDOFF.md](docs/CODEX_HANDOFF.md) for the current Codex handoff status.
