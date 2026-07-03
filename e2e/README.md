# E2E testing

Playwright config: root `playwright.config.ts`. Fixtures self-describe in `e2e/fixtures/*/fixture.e2e.ts`.

Full policy: [`docs/e2e-test-plan.md`](../docs/e2e-test-plan.md).

## Three runs (full suite)

| Script                        | What                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `pnpm build:e2e:kitchen-sink` | Build kitchen-sink `dist/` (~10s). Required before preview tests.            |
| `pnpm test:e2e:static`        | One `playwright test` — fixture static/preview projects (parallel).          |
| `pnpm test:e2e:dev`           | One `playwright test` — fixture dev servers (core-hmr, react, react-router). |
| `pnpm test:e2e:kitchen-sink`  | One Playwright run per cell (in-repo dev/parity), then isolated HMR          |
| `pnpm test:e2e`               | Build + all three runs above.                                                |

PR CI uses `test:e2e:pr` (drops node preview + HMR; greps canonical dev).

## Single project

```bash
pnpm run build:e2e:kitchen-sink   # before preview projects
ECOPAGES_PLAYWRIGHT_PROJECTS=cross-integration-dev-e2e playwright test --project cross-integration-dev-e2e
```

Without `ECOPAGES_PLAYWRIGHT_PROJECTS`, `playwright.config.ts` boots **every** webServer in the matrix. Batch scripts set it automatically.

Or `pnpm test:e2e:ui` for the Playwright UI.

## Adding a fixture

1. Add `e2e/fixtures/<block>/fixture.e2e.ts`
2. Register in `e2e/playwright/capability-fixture-registry.ts`
3. Add the project name to the right `package.json` script (`test:e2e:static`, `test:e2e:dev`, or `run-each-project.mjs` list)

## Test tiers

| Tier       | Command                | Runs                                      |
| ---------- | ---------------------- | ----------------------------------------- |
| Pre-commit | `pnpm test:pre-commit` | vitest + lint + typecheck (no Playwright) |
| PR         | `pnpm test:ci`         | vitest + `test:e2e:pr`                    |
| Full       | `pnpm test:all`        | vitest + `test:e2e`                       |

## Kitchen-sink cross-integration

- **Preview** — in-repo `dist/`, built before e2e; `webServer` only serves (`start-kitchen-sink-preview-server.mjs`).
- **Canonical dev** — `cross-integration-dev-e2e` (ecopages + node), full suite.
- **Parity** — bun, vite+node, vite+bun run only `parity.test.e2e.ts` (`@parity`), isolated `.e2e-tmp` workspace each.
- **HMR** — `includes-hmr.test.e2e.ts`, own workspace.

## Environment variables

| Variable                                   | Effect                                               |
| ------------------------------------------ | ---------------------------------------------------- |
| `ECOPAGES_REUSE_TEST_SERVERS=true`         | Reuse running web servers                            |
| `ECOPAGES_KEEP_E2E_TMP=true`               | Keep `.e2e-tmp/` after isolated runs                 |
| `ECOPAGES_PLAYWRIGHT_PROJECTS`             | Comma-separated project filter for `playwright test` |
| `ECOPAGES_MANAGE_ISOLATED_WORKSPACES=true` | Set by `run-each-project.mjs` for kitchen-sink cells |
