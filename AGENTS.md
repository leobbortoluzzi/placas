# Repository Guidelines

## Project Structure & Module Organization

This repository contains a TypeScript Cloudflare Worker that provisions NFC/QR tags in Supabase and redirects scans. Runtime code is in `src/`: `index.ts` handles requests, `html.ts` renders activation pages, `validate.ts` parses and validates `/t/{serial}` paths, `supabase.ts` performs REST operations, `random.ts` generates identifiers, and `types.ts` defines database row shapes. Worker settings and public variables live in `wrangler.jsonc`; TypeScript settings are in `tsconfig.json`. `.dev.vars.example` documents local secrets. Route tests live in `tests/`.

## Build, Test, and Development Commands

Run `npm install` after checkout. The main commands are:

- `npm run dev` — start Wrangler’s local Worker at `127.0.0.1:8787`.
- `npm run check` — run strict TypeScript checking with no emitted files.
- `npm test` — run the Vitest route and Supabase-mock test suite.
- `npm run types` — regenerate Wrangler’s Worker binding declarations when configuration changes.
- `npm run deploy` — deploy the Worker to Cloudflare; use only after checks pass.

For a local smoke test, start `npm run dev` and request a valid path such as `curl -I http://127.0.0.1:8787/t/FF0F16FD7E0100`.

## Coding Style & Naming Conventions

Use TypeScript with strict checking, ES2022 modules, two-space indentation, semicolons, and double-quoted strings, matching the existing source. Use `camelCase` for functions and variables, `PascalCase` for types/interfaces, and uppercase names for Worker environment variables. Keep validation and Supabase access in their existing modules rather than expanding `index.ts` unnecessarily.

## Testing Guidelines

Use Vitest tests in `tests/` with mocked Supabase `fetch` responses. Every change should pass `npm run check` and `npm test`; when request behavior changes, include a local smoke test covering a valid tag, an invalid path, and fallback behavior. Confirm that repeated scans do not regenerate a tag’s `code` or `password`.

## Commit & Pull Request Guidelines

Use short, imperative commit subjects consistent with history, for example `Require /t/ prefix` or `Persist dashboard secrets`. Pull requests should describe behavior and configuration changes, list verification commands, and call out any database or Cloudflare dashboard steps. Do not commit `.dev.vars`, service-role keys, generated credentials, or other secrets. Link the relevant issue when one exists; screenshots are unnecessary for backend-only changes.

## Security & Configuration Tips

Keep `SUPABASE_SERVICE_ROLE_KEY` as a Cloudflare secret, never under `vars` or in source control. Preserve RLS and the absence of public policies on `public.tag`. Treat `password` as sensitive: it is stored in plaintext and intentionally shown only on the pending activation page; never expose it through a public API, active redirect, or log.
