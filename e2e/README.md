# E2E testing

Playwright coverage is orchestrated by `e2e/scripts/playwright/run-e2e.ts`. Root `playwright.config.ts` composes self-describing capability fixtures from `e2e/fixtures/*/fixture.e2e.ts`; shared wiring lives in `e2e/playwright/`.

Full policy and project matrix: [`docs/e2e-test-plan.md`](../docs/e2e-test-plan.md).

## Capability fixtures

Each integration block lives under `e2e/fixtures/<block>/` with:

- `app.ts`, `eco.config.ts`, `package.json` — the fixture app (when in-repo)
- `fixture.e2e.ts` — declares Playwright projects plus web servers
- `*.test.e2e.ts` — tests co-located with the app

After adding a fixture, register it in `e2e/playwright/capability-fixture-registry.ts` and add its projects to a wave in `e2e/playwright/orchestration-waves.ts` (coverage guarded by `assertWaveCoverage()`).

Run one project locally:

```bash
pnpm test:e2e --project core-hmr-dev-e2e
pnpm test:e2e --project browser-router-e2e
pnpm test:e2e --project cross-integration-dev-e2e
```

## Commands

| Command                          | Purpose                                     |
| -------------------------------- | ------------------------------------------- |
| `pnpm test:e2e`                  | Full gate (8 sequential waves)              |
| `pnpm test:gate`                 | Fast local loop: vitest + stress smoke      |
| `pnpm test:all`                  | Vitest + full e2e (CI, pre-commit, publish) |
| `pnpm test:e2e --project <name>` | Single project (bypasses waves)             |
| `pnpm test:e2e:ui`               | Playwright UI (debug; bypasses waves)       |

## Orchestration waves

Five sequential waves — one Playwright subprocess each. Definitions in `e2e/playwright/orchestration-waves.ts`:

```
1. static-wave:           7 static/preview projects (N workers each)
2. core-hmr-dev:          2 dev projects (1 worker each)
3. fixture-dev:           2 dev projects (1 worker each)
4. cross-integration-dev: 2 dev projects (1 worker each, shared workspace)
5. cross-integration-hmr: 1 hmr project (1 worker, isolated workspace)
```

`--project` bypasses waves and runs a single Playwright invocation. `--grep` passes through to Playwright native.

## Environment variables

Only set these when debugging. Normal `pnpm test:e2e` does not require any of them.

### Debugging

| Variable                       | Values                        | Effect                                                                                                                                        |
| ------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ECOPAGES_E2E_TIMING`          | `true`                        | Log per-wave wall-clock as `[e2e-timing]`                                                                                                     |
| `ECOPAGES_REUSE_TEST_SERVERS`  | `true`                        | Reuse already-running web servers (`playwright.config.ts`)                                                                                    |
| `ECOPAGES_KEEP_E2E_TMP`        | `true`                        | Keep `.e2e-tmp/` workspace copies after a run (`run-isolated-app.mjs`)                                                                        |
| `ECOPAGES_PLAYWRIGHT_PROJECTS` | comma-separated project names | Limit which Playwright projects start. `run-e2e.ts` sets this when you pass `--project`; only needed when invoking `playwright test` directly |

### Internal (set by harness — do not set manually)

These are written by `run-isolated-app.mjs` / `playwright.config.ts` so cross-integration variants stay isolated. Documented here so env dumps are interpretable.

| Variable                              | Set by                                    | Purpose                                                                  |
| ------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| `ECOPAGES_MANAGE_ISOLATED_WORKSPACES` | run-e2e.ts                                | Coordinate cleanup when multiple projects share one `.e2e-tmp` workspace |
| `ECOPAGES_E2E_ARTIFACT_SCOPE`         | define-fixture.ts + isolated app launcher | Scope `dist-*` / `.eco-*` dirs per parallel project                      |
| `ECOPAGES_CROSS_INTEGRATION_HOST`     | isolated app launcher                     | `vite` when the vite-host row is under test                              |
| `ECOPAGES_CROSS_INTEGRATION_E2E`      | isolated app launcher                     | `true` for ecopages-hosted cross-integration runs (Bun idle timeout)     |

### Fixture / app runtime (not e2e-specific)

Used inside fixture `eco.config.ts` or server commands started by Playwright:

| Variable                         | Typical use                                |
| -------------------------------- | ------------------------------------------ |
| `ECOPAGES_PORT`                  | Server port for a fixture                  |
| `ECOPAGES_PERSIST_LAYOUTS`       | React-router persist-layouts fixtures      |
| `ECOPAGES_USE_POSTCSS_PROCESSOR` | Core HMR fixture (`e2e/fixtures/core-hmr`) |

## Vitest opt-in suites

Slow or specialized Vitest files are **not** in the default `pnpm test:vitest` glob. They are registered in `scripts/vitest-optional-includes.ts` and enabled when their env var is `1`.

| Variable                            | Script                           | Suite                                                                         |
| ----------------------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| `ECOPAGES_TEST_STATIC_BUILD_PARITY` | `pnpm test:vitest:static-parity` | Unified pages graph HTML parity (`static-build-unified-graph-parity.test.ts`) |

To add another opt-in suite: add an entry to `scripts/vitest-optional-includes.ts` and a `package.json` script that exports the env var.

## Benchmark env vars (Vitest bench project)

Kitchen-sink benchmarks use the `bench` Vitest project (`vitest.bench.config.ts`), not Playwright.

| Variable                         | Values | Effect                                                                        |
| -------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `ECOPAGES_BENCH`                 | `1`    | Required by bench bodies via `shouldRunBench()` (`pnpm test:bench` sets this) |
| `ECOPAGES_BENCH_PRODUCTION_DIST` | `1`    | Opt-in extra bench case writing to production `dist/`                         |

See `playground/kitchen-sink/bench/README.md` for baseline workflow.
