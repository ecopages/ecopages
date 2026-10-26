# End-to-end testing

Run the main Playwright suite with one command:

```sh
pnpm test:e2e
```

The projects are listed directly in the root `playwright.config.ts`. Node runs the behavioral, preview, and HMR suites. Bun runs the runtime-parity project and the dependency-discovery specs against a Bun production build. The imported-views projects copy a private app per worker and check that an imported view reloads in development on Node and Bun. The React Router preview project also checks persisted sidebar scroll through client navigation and browser history. The endpoints-only project builds an app whose only handler is an endpoint file and runs it with `ecopages start`. Preview projects build their app in the configured `webServer` command before the preview server starts. Playwright starts those web servers before project setup tests, so a setup project cannot build an artifact that a web server needs.

The config starts only web servers used by the selected projects. With `--shard`, it asks Playwright's JSON list reporter which projects contain tests in that shard, then starts only their web servers. `--list` does not start any web server.

## Pull requests and docs

CI runs the full Playwright suite on every pull request and on pushes to `develop` and `main`. Four shard jobs run in parallel; a final `e2e` check fails if any shard fails. Vitest runs in the `fast` job and does not run again in the E2E shards.

Each E2E shard uploads its `test-results/` directory as a GitHub Actions artifact named `playwright-traces-shard-<shard>` for seven days. Download the artifact for the failed shard from the workflow run to inspect its Playwright traces and other test results.

For a smaller local run, `pnpm test:e2e:pr` selects the fixture, preview and HMR projects and filters the canonical kitchen-sink and Bun parity projects to `@content`, `@stress`, and `@parity` tests.

Docs e2e runs separately:

```sh
pnpm test:e2e:docs
```

It builds `apps/docs` and serves that output from its dedicated `playwright.docs.config.ts`. CI runs the `docs` job when a pull request or push changes the docs app, its workspace dependencies, the docs specs, or the docs Playwright config. Template-only changes do not select that job.

## Worker app fixture

`e2e/app-fixture.ts` exports a `test` fixture for projects that need a private dev app. Set `use.appOptions` with the app source and optional runtime, environment, config file, or readiness timeout. The first test on a worker that needs a page, request, or `app` copies the source into `.e2e-tmp/<project>-w<workerIndex>`, links `node_modules`, starts `ecopages dev` on an OS-selected port, and points `baseURL` at that server. Projects that do not use `appOptions` start no worker app.

Source-mutating specs edit `app.dir`, their worker's private copy. The fixture removes that copy when the worker ends. A copy left behind by an interrupted process is replaced when that worker starts again. The server runs in its own process group so teardown also stops runtime processes started by the CLI.

Kitchen-sink HMR uses one app copy per worker, so source-mutating tests can run in parallel without sharing edits. Shared-server projects do not edit their sources.

## Add coverage

Add the spec beside its fixture and add the project to the explicit array in `playwright.config.ts`. Put docs site browser checks in the docs config. Use `e2e/app-fixture.ts` when a dev test mutates source files or needs a private dev server; use `webServer` for shared static and preview servers.

`react-lazy-first-load-e2e` (`explicitGraph`, no router) and kitchen-sink `content-lazy.test.e2e.ts` pin first hydration when a `React.lazy` chunk fails: the server HTML is restored once React drops the page root, and the chunk is not retried; a Page-level error boundary keeps the rest of the Page and shows the fallback.

Vitest covers unit and browser-level behavior through `pnpm test:vitest`. Playwright covers behavior that needs the wired app and a real browser. On pull requests, repository CI runs `test:ci:fast` alongside the four-shard `test:e2e` suite. Pushes to `develop` and `main` run the sharded E2E suite. Docs e2e runs separately when a pull request or push changes its selected paths.

`pnpm test:e2e:ui` opens Playwright's UI. Tests run headless by default; use `playwright test --headed` or `--debug` for local inspection. Inherited `PWDEBUG` is stripped unless `--debug` is present.

Set `ECOPAGES_KEEP_E2E_TMP=true` to keep per-worker app copies after a run for debugging.
