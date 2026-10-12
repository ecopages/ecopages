# E2E testing

Playwright config: root `playwright.config.ts`. Fixtures self-describe in `e2e/fixtures/*/fixture.e2e.ts`. Helper unit tests live in `e2e/playwright/*.test.ts` and `e2e/scripts/**/*.test.ts` (`pnpm test:vitest`).

## Policy

1. **Three tiers.** Pre-commit runs `test:pre-commit` (vitest + lint + typecheck, no Playwright). PRs run `test:ci:fast` (lint, format check, typecheck, vitest; no Playwright). Pushes to `develop` run `test:ci:e2e` (vitest + full e2e). Playwright coverage is listed in root `package.json` (`test:e2e:static`, `test:e2e:dev`, `test:e2e:kitchen-sink`).
2. **Cross-integration certifies runtime parity without a full matrix.** One canonical dev project (ecopages + **node**) runs the full behavioral suite. The Bun cell runs only the `@parity` document-navigation spec at `workers: 1`. Preview runs the same specs against a Bun production build and a Node production build.
3. **Rapid-navigation stays stressful.** Use `fireRapidLinkClicks` (overlapping navigations). Pacing every hop with full document waits stops testing SSR under load.
4. **Three Playwright runs for the full suite.** `test:e2e:static` (one subprocess, parallel static/preview), `test:e2e:dev` (fixture dev servers), `test:e2e:kitchen-sink` (one subprocess per kitchen-sink cell — dev servers must not boot together). Kitchen-sink preview output is built in shell before Playwright (`build:e2e:kitchen-sink`): Node into `dist/`, Bun into `dist-preview-bun`.
5. **Preview vs dev is capability-based.** Tests move to preview only when static output can serve them. API handlers, middleware locals, WebSockets, and HMR stay on dev/HMR projects.
6. **Native Playwright.** Use `playwright test --project`, `--grep`, and `package.json` scripts. No custom test runner wrapper.

Pre-commit: `pnpm test:pre-commit`. PR CI (`.github/workflows/ci.yml`): `pnpm test:ci:fast`. `develop` e2e (`.github/workflows/ci.yml`): `pnpm test:ci:e2e`.

Playwright projects (20 total) are defined in `playwright.config.ts`.

## Three runs (full suite)

| Script                        | What                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm build:e2e:kitchen-sink` | Build kitchen-sink `dist/` on Node and `dist-preview-bun` on Bun. Required before preview tests. |
| `pnpm test:e2e:static`        | One `playwright test` — fixture static/preview projects (parallel).                              |
| `pnpm test:e2e:dev`           | One Playwright run per fixture dev server (core-hmr, react, react-router, html-pages).           |
| `pnpm test:e2e:kitchen-sink`  | One Playwright run per cell (in-repo dev/parity), then isolated HMR on Bun                       |
| `pnpm test:e2e`               | Build + all three runs above.                                                                    |

`test:e2e:pr` is a smaller local subset (drops the kitchen-sink node preview + HMR; greps canonical dev); CI does not run it. A fixture project with `runtime: 'node'` serves its static build on Node through the `ecopages` CLI, as `html-pages-node-e2e` does.

## Single project

```bash
pnpm run build:e2e:kitchen-sink   # before preview projects
ECOPAGES_PLAYWRIGHT_PROJECTS=cross-integration-dev-e2e playwright test --project cross-integration-dev-e2e
```

Without `ECOPAGES_PLAYWRIGHT_PROJECTS`, `playwright.config.ts` boots **every** webServer in the matrix. Batch scripts set it automatically.

Or `pnpm test:e2e:ui` for the Playwright UI.

## Busy fixture ports

Before a fixture web server starts, `playwright.config.ts` runs `e2e/scripts/playwright/assert-ports-free.mjs` on the ports its projects test against (from each project's `baseURL`). If something already listens there, the run stops with `Port <port> is already in use by PID <pid>` (the PID comes from `lsof` when it is installed). Stop that process, usually a server left by an interrupted run, and run again.

The check exists because the fixture servers signal readiness on stdout, so Playwright does not check the port itself, and a Bun server starts on a busy port instead of failing; the tests would then reach the old server. It is skipped when `ECOPAGES_REUSE_TEST_SERVERS=true`.

## Adding a fixture

1. Add `e2e/fixtures/<block>/fixture.e2e.ts`
2. Register in `e2e/playwright/capability-fixture-registry.ts`
3. Add the project name to the right `package.json` script (`test:e2e:static`, `test:e2e:dev`, or `run-each-project.mjs` list)

## Test tiers

| Tier       | Command                | Runs                                               |
| ---------- | ---------------------- | -------------------------------------------------- |
| Pre-commit | `pnpm test:pre-commit` | vitest + lint + typecheck (no Playwright)          |
| PR         | `pnpm test:ci:fast`    | lint + format check + typecheck + vitest           |
| Full       | `pnpm test:all`        | vitest + `test:e2e`                                |
| Gate       | `pnpm test:gate`       | vitest + stress smoke (`@stress` on canonical dev) |

## Test filename suffixes

The Vitest browser regression in `packages/dev-toolbar/src/shell/build-errors.test.browser.ts` drives HMR socket messages through the reference Dev Toolbar. It covers distinct errors, recovery, stealth reveal, late mounting, custom-client ownership, and the fallback without a mounted toolbar.

| Pattern                     | Runs on                                |
| --------------------------- | -------------------------------------- |
| `*.dev.test.e2e.ts`         | dev only                               |
| `*.static.test.e2e.ts`      | static only                            |
| `*.postcss.dev.test.e2e.ts` | PostCSS dev only                       |
| `*.test.e2e.ts`             | per project `testMatch` / `testIgnore` |

## Kitchen-sink cross-integration

- **Preview** — in-repo output, built before e2e; `webServer` only serves (`start-kitchen-sink-preview-server.mjs`). Bun preview (`cross-integration-preview-e2e`) serves `dist-preview-bun` from `ecopages build --runtime bun`. Node preview serves `dist/` from `ecopages build --runtime node`.
- **Canonical dev** — `cross-integration-dev-e2e` (ecopages + node), full suite.
- **Parity** — bun runs only `parity.test.e2e.ts` (`@parity`).
- **HMR** — `*-hmr.test.e2e.ts`, isolated `.e2e-tmp` workspace each, `workers: 1`. Specs mutate that copy, so extra Playwright workers race the writes. `test:e2e:kitchen-sink` runs the Bun project (`cross-integration-hmr-e2e`); `cross-integration-hmr-node-e2e` is in no script. These fixtures compile Pages on demand instead of forcing unrelated Page prewarms on every restart. Playwright waits for the Ecopages listen log, which is printed after integration warmup and watcher initialization.

Development fixture projects default to a 60-second test timeout (`DEV_FIXTURE_TEST_TIMEOUT_MS` in `e2e/playwright/define-fixture.ts`). Ordinary Page HMR mutations retain their 25-second allowance. The WebSocket-handler scenario waits for the lightweight API route before reading a new connection's history, avoiding repeated failed browser handshakes during replacement. Restoration checks both Pages and the original chat history. CSS discovery scenarios wait for the HMR connection and observe the stylesheet update on the current Page, without polling manual reloads.

Browsers stay headless for `pnpm test:all` / `pnpm test:vitest` / `pnpm test:e2e` (`playwright.config.ts` `use.headless`, Vitest `browser.headless`, `--browser.headless`). Inherited `PWDEBUG` is stripped before Playwright launches so the inspector cannot force headed Chromium (one visible tab per parallel worker). Use `pnpm test:e2e:ui` or `playwright test --headed` when you want a visible window. `--debug` still enables the inspector.

## Environment variables

| Variable                                   | Effect                                               |
| ------------------------------------------ | ---------------------------------------------------- |
| `ECOPAGES_REUSE_TEST_SERVERS=true`         | Reuse running web servers; skips the busy-port check |
| `ECOPAGES_KEEP_E2E_TMP=true`               | Keep `.e2e-tmp/` after isolated runs                 |
| `ECOPAGES_PLAYWRIGHT_PROJECTS`             | Comma-separated project filter for `playwright test` |
| `ECOPAGES_MANAGE_ISOLATED_WORKSPACES=true` | Set by `run-each-project.mjs` for kitchen-sink cells |
