# E2E testing

Playwright coverage is orchestrated by `e2e/scripts/playwright/run-e2e.mjs`. Root `playwright.config.ts` is a thin entrypoint; shared wiring lives in `e2e/playwright/`.

Full policy and project matrix: [`docs/e2e-test-plan.md`](../docs/e2e-test-plan.md).

## Commands

| Command                  | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `pnpm test:e2e`          | Full gate (all batches)                            |
| `pnpm test:e2e:smoke`    | Cross-host stress subset (`@stress`)               |
| `pnpm test:e2e:stress`   | Kitchen-sink rapid stress only                     |
| `pnpm test:e2e:kitchen`  | Full kitchen-sink matrix                           |
| `pnpm test:e2e:timing`   | Stress subset with `[e2e-timing]` logs             |
| `pnpm test:e2e:baseline` | Full gate with timing logs                         |
| `pnpm test:e2e:ui`       | Playwright UI (debug; bypasses batch orchestrator) |

## Environment variables

Only set these when debugging or tuning CI. Normal `pnpm test:e2e` does not require any of them.

### Orchestration (`run-e2e.mjs`)

| Variable                          | Values           | Effect                                                                                |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| `ECOPAGES_E2E_TIMING`             | `true`           | Log per-batch wall-clock as `[e2e-timing]`                                            |
| `ECOPAGES_E2E_SERVER_CONCURRENCY` | positive integer | Cap parallel kitchen-sink **preview** isolated servers (default `availableParallelism()`) |
| `ECOPAGES_E2E_DEV_CONCURRENCY`    | positive integer | Cap parallel kitchen-sink **dev** processes (default `min(2, availableParallelism())`)    |
| `ECOPAGES_E2E_HMR_CONCURRENCY`      | positive integer | Cap parallel kitchen-sink **HMR** processes (default `1` — parallel boot is unstable)     |

### Local debugging

| Variable                       | Values                        | Effect                                                                                                                                                           |
| ------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ECOPAGES_REUSE_TEST_SERVERS`  | `true`                        | Reuse already-running web servers (`playwright.config.ts`)                                                                                                       |
| `ECOPAGES_KEEP_E2E_TMP`        | `true`                        | Keep `.e2e-tmp/` workspace copies after a run (`run-isolated-app.mjs`)                                                                                           |
| `ECOPAGES_PLAYWRIGHT_PROJECTS` | comma-separated project names | Limit which Playwright projects (and web servers) start. `run-e2e.mjs` sets this when you pass `--project`; only needed when invoking `playwright test` directly |

### Internal (set by harness — do not set manually)

These are written by `run-isolated-app.mjs` / `playwright.config.ts` so kitchen-sink variants stay isolated. Documented here so env dumps are interpretable.

| Variable                              | Set by                          | Purpose                                                                  |
| ------------------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| `ECOPAGES_MANAGE_ISOLATED_WORKSPACES` | shared kitchen-sink web servers | Coordinate cleanup when multiple projects share one `.e2e-tmp` workspace |
| `ECOPAGES_E2E_ARTIFACT_SCOPE`         | isolated app launcher           | Scope `dist-*` / `.eco-*` dirs per parallel project                      |
| `ECOPAGES_KITCHEN_SINK_HOST`          | isolated app launcher           | `vite` when the vite-host matrix row is under test                       |
| `ECOPAGES_KITCHEN_SINK_E2E`           | isolated app launcher           | `true` for ecopages-hosted kitchen-sink runs (Bun idle timeout)          |

### Fixture / app runtime (not e2e-specific)

Used inside fixture `eco.config.ts` or server commands started by Playwright:

| Variable                         | Typical use                           |
| -------------------------------- | ------------------------------------- |
| `ECOPAGES_PORT`                  | Server port for a fixture             |
| `ECOPAGES_PERSIST_LAYOUTS`       | React-router persist-layouts fixtures |
| `ECOPAGES_USE_POSTCSS_PROCESSOR` | Core PostCSS e2e fixture              |

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
