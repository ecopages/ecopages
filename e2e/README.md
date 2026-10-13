# E2E testing

Playwright config: root `playwright.config.ts`. Fixtures self-describe in `e2e/fixtures/*/fixture.e2e.ts`. Helper unit tests live in `e2e/playwright/*.test.ts` and `e2e/scripts/**/*.test.ts` (`pnpm test:vitest`).

A check that needs no browser and no fixed-port fixture server is a Vitest suite beside the fixture it renders: `e2e/fixtures/<block>/*.test.ts` (`pnpm test:vitest`). `startStaticExport` in `e2e/utils/static-export.ts` builds a fixture's static export in-process and serves it on a free port. `cache/cache.test.ts` drives the cache fixture through `app.fetch()` with a faked `Date`, and `html-pages/html-pages.output.test.ts` and `browser-router/lazy-dependencies.output.test.ts` read exported HTML. Client-only behaviour that real input can drive without a server runs in Vitest browser mode: the `PrefetchManager` strategies are in `packages/browser-router/test/prefetch-manager.test.browser.ts`, and `fixtures/browser-router/prefetch.test.e2e.ts` keeps only the stylesheet prefetch and the preload warning. A persisted element's scroll across a swap and back is in `packages/browser-router/test/eco-router.persisted-sidebar.test.browser.ts`, react-router layout switching and persistence in `packages/react-router/test/layout-navigation.test.browser.ts`, and its view-transition wiring in `packages/react-router/test/view-transitions.test.browser.ts`, so `fixtures/docs/navigation.test.e2e.ts` is one smoke test of the built docs site. Specs here keep only what needs a browser against a real server.

## Policy

1. **Three tiers.** Pre-commit runs `test:pre-commit` (vitest + lint + typecheck, no Playwright). In CI (`.github/workflows/ci.yml`), every pull request runs `test:ci:fast` (job `fast`: lint, format check, typecheck, vitest) and `test:e2e:pr` (job `e2e`). Pushes to `develop` and `main` run `test:e2e` (job `e2e`, the full suite). Vitest runs only in `fast`, through `test:vitest`: the `shared-core` and `browser` projects, one project each for `apps/docs`, `templates/docs-starter` and `templates/llm-wiki/app`, and the kitchen-sink static-build parity oracle (`playground/kitchen-sink/bench/static-build-unified-graph-parity.test.ts`). No Vitest suite is gated by an environment variable. Playwright coverage is listed in root `package.json` (`test:e2e:static`, `test:e2e:dev`, `test:e2e:kitchen-sink`).
2. **Cross-integration certifies runtime parity without a full matrix.** Everything runs on Node except one Bun cell. One canonical dev project (ecopages + **node**) runs the full behavioral suite, and the HMR specs run on Node too. The Bun cell runs only the `@parity` document-navigation spec and the dependency-discovery specs under `ecopages dev --runtime bun`, and fails when dev init takes longer than 45 s. Preview runs every preview spec against a Node production build, and the dependency-discovery preview specs against a Bun production build.
3. **Rapid-navigation stays stressful.** Use `fireRapidLinkClicks` (overlapping navigations). Pacing every hop with full document waits stops testing SSR under load.
4. **Three Playwright runs for the full suite.** `test:e2e:static` (one subprocess, parallel static/preview), `test:e2e:dev` (fixture dev projects, one dev server per worker), `test:e2e:kitchen-sink` (kitchen-sink dev, parity and HMR in one subprocess, one dev server per worker). Kitchen-sink preview output is built in shell before Playwright (`build:e2e:kitchen-sink`): Node into `dist/`, Bun into `dist-bun-build`.
5. **Preview vs dev is capability-based.** Tests move to preview only when static output can serve them. API handlers, middleware locals, WebSockets, and HMR stay on dev/HMR projects.
6. **Native Playwright.** Use `playwright test --project`, `--grep`, and `package.json` scripts. No custom test runner wrapper.

Playwright projects (17 total) are defined in `playwright.config.ts`.

## Three runs (full suite)

| Script                        | What                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm build:e2e:kitchen-sink` | Build kitchen-sink `dist/` on Node and `dist-bun-build` on Bun. Required before preview tests. |
| `pnpm test:e2e:static`        | One `playwright test` — fixture static/preview projects (parallel).                            |
| `pnpm test:e2e:dev`           | One `playwright test` — fixture dev projects (core-hmr, react, react-router, html-pages).      |
| `pnpm test:e2e:kitchen-sink`  | One `playwright test` — kitchen-sink dev, Bun parity and HMR (a dev server per worker).        |
| `pnpm test:e2e`               | Build + all three runs above.                                                                  |

`test:e2e:pr` is the pull-request subset: it runs the same static and fixture dev projects and the HMR project, and greps canonical dev and Bun parity to `@content|@stress|@parity`. Fixture dev and static projects start through the `ecopages` CLI on Node: `ecopages dev`, and `ecopages preview`, which builds the static export and serves it.

## Single project

```bash
pnpm run build:e2e:kitchen-sink   # before preview projects
ECOPAGES_PLAYWRIGHT_PROJECTS=cross-integration-dev-e2e playwright test --project cross-integration-dev-e2e
```

Without `ECOPAGES_PLAYWRIGHT_PROJECTS`, `playwright.config.ts` boots **every** webServer in the matrix. Batch scripts set it automatically.

Or `pnpm test:e2e:ui` for the Playwright UI.

## App per worker

`e2e/app-fixture.ts` exports a `test` whose worker-scoped `app` fixture gives each Playwright worker a dev server of its own. A project opts in with `use.appOptions` (`source` folder, optional `runtime`, `env`, `configFile` and `readyTimeoutMs`) and its specs import `test` and `expect` from the fixture instead of `@playwright/test`.

The first test of a worker that needs a page, a request or `app` copies `source` to `.e2e-tmp/<project>-w<workerIndex>` (`node_modules` is linked, build output and caches are left out), starts `ecopages dev` there on a port the OS picked, waits for the `Node server running at` or `Bun server running at` line, and points `baseURL` at it. A worker whose tests use none of these starts nothing. `app.dir` is the copy, so specs that edit sources edit files under it: the checked-in tree is never written, a run stopped with Ctrl-C leaves `git status` clean, and the copy is removed when the worker ends. A copy left by a killed run is replaced when the same worker index starts again. The server runs in its own process group so stopping it also stops the runtime processes the CLI starts.

## Busy fixture ports

Before a static or preview web server starts, `playwright.config.ts` runs `e2e/scripts/playwright/assert-ports-free.mjs` on the ports its projects test against (from each project's `baseURL`). If something already listens there, the run stops with `Port <port> is already in use by PID <pid>` (the PID comes from `lsof` when it is installed). Stop that process, usually a server left by an interrupted run, and run again.

The check exists because these servers signal readiness on stdout, so Playwright does not check the port itself, and a server that starts on a busy port instead of failing would let the tests reach the old server. Dev servers started by the app fixture pick a free port themselves. It is skipped when `ECOPAGES_REUSE_TEST_SERVERS=true`.

## Adding a fixture

1. Add `e2e/fixtures/<block>/fixture.e2e.ts`
2. Register in `e2e/playwright/capability-fixture-registry.ts`
3. Add the project name to the right `package.json` script (`test:e2e:static`, `test:e2e:dev` or `test:e2e:kitchen-sink`)

## Test tiers

| Tier       | Command                | Runs                                               |
| ---------- | ---------------------- | -------------------------------------------------- |
| Pre-commit | `pnpm test:pre-commit` | vitest + lint + typecheck (no Playwright)          |
| PR         | `pnpm test:ci:fast`    | lint + format check + typecheck + vitest           |
| PR         | `pnpm test:e2e:pr`     | pull-request e2e subset                            |
| Push       | `pnpm test:e2e`        | full e2e on `develop` and `main`                   |
| Full       | `pnpm test:all`        | vitest + `test:e2e` (local, Publish workflow)      |
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

- **Preview** — in-repo output, built before e2e; `webServer` only serves (`start-kitchen-sink-preview-server.mjs`). Node preview (`cross-integration-preview-e2e`) serves `dist/` from `ecopages build --runtime node` and runs every preview spec. The Bun build project (`cross-integration-bun-build-e2e`) serves `dist-bun-build` from `ecopages build --runtime bun` and runs only `dependency-discovery.preview.test.e2e.ts`.
- **Canonical dev** — `cross-integration-dev-e2e` (ecopages + node), full suite, on the per-worker app copy.
- **Parity** — bun runs only `parity.test.e2e.ts` (`@parity`), which also registers the dependency-discovery specs. Its `readyTimeoutMs` is 45 s, because the watcher's initial crawl is much slower on Bun; a server that has not printed its ready line by then fails the worker's fixture instead of passing inside the default 120 s. The project uses at most two workers, since every worker starts its own Bun dev server.
- **HMR** — `*-hmr.test.e2e.ts` on the per-worker app copy (see "App per worker"). A file's tests run in order on one worker, and different files run on different workers, so `--workers 4` spreads the files over four copies. `test:e2e:hmr` runs the Node project (`cross-integration-hmr-node-e2e`), in both `test:e2e` and `test:e2e:pr`. These fixtures compile Pages on demand instead of forcing unrelated Page prewarms on every restart. The fixture waits for the Ecopages listen log, which is printed after integration warmup and watcher initialization.

Development fixture projects default to a 60-second test timeout (`DEV_FIXTURE_TEST_TIMEOUT_MS` in `e2e/playwright/define-fixture.ts`). Ordinary Page HMR mutations retain their 25-second allowance. The WebSocket-handler scenario waits for the lightweight API route before reading a new connection's history, avoiding repeated failed browser handshakes during replacement. Restoration checks both Pages and the original chat history. CSS discovery scenarios wait for the HMR connection and observe the stylesheet update on the current Page, without polling manual reloads.

## Helper failures

Playwright's web-server readiness check handles startup. After a test starts, `requestGetAndWait` makes one GET; a non-2xx response fails with its status and up to 300 characters of the response body, and its optional timeout bounds that request. `gotoAndWait` performs one navigation, while `waitForPageReady` propagates URL and document-readiness failures. Counter helpers wait for the runtime-specific hydration or readiness signal when one exists, click once, and assert the resulting value.

Browsers stay headless for `pnpm test:all` / `pnpm test:vitest` / `pnpm test:e2e` (`playwright.config.ts` `use.headless`, Vitest `browser.headless`, `--browser.headless`). Inherited `PWDEBUG` is stripped before Playwright launches so the inspector cannot force headed Chromium (one visible tab per parallel worker). Use `pnpm test:e2e:ui` or `playwright test --headed` when you want a visible window. `--debug` still enables the inspector.

## Environment variables

| Variable                           | Effect                                                    |
| ---------------------------------- | --------------------------------------------------------- |
| `ECOPAGES_REUSE_TEST_SERVERS=true` | Reuse running web servers; skips the busy-port check      |
| `ECOPAGES_KEEP_E2E_TMP=true`       | Keep the per-worker app copies in `.e2e-tmp/` after a run |
| `ECOPAGES_PLAYWRIGHT_PROJECTS`     | Comma-separated project filter for `playwright test`      |
