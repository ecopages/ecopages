# End-to-end testing

Run the main Playwright suite with one command:

```sh
pnpm test:e2e
```

The projects are listed directly in the root `playwright.config.ts`. Node runs the behavioral, preview, and HMR suites. Bun runs the runtime-parity project and the dependency-discovery specs against a Bun production build. The React Router preview project also checks persisted sidebar scroll through client navigation and browser history. Preview projects build their app in the configured `webServer` command before the preview server starts. Playwright starts those web servers before project setup tests, so a setup project cannot build an artifact that a web server needs.

The config starts only web servers used by the selected projects. With `--shard`, it asks Playwright's JSON list reporter which projects contain tests in that shard, then starts only their web servers. `--list` does not start any web server.

## Pull requests and docs

`pnpm test:e2e:pr` runs the pull-request project selection in one Playwright invocation. It includes the full fixture, preview and HMR projects and filters the canonical kitchen-sink and Bun parity projects to `@content`, `@stress`, and `@parity` tests.

Docs e2e runs separately:

```sh
pnpm test:e2e:docs
```

It builds `apps/docs` and serves that output from its dedicated `playwright.docs.config.ts`. CI runs the `docs` job when a pull request or push changes the docs app, its workspace dependencies, the docs specs, or the docs Playwright config. Template-only changes do not select that job.

## Worker app fixture

`e2e/app-fixture.ts` exports a `test` fixture for projects that need a private dev app. Set `use.appOptions` with the app source and optional runtime, environment, config file, or readiness timeout. The first test on a worker that needs a page, request, or `app` copies the source into `.e2e-tmp/<project>-w<workerIndex>`, links `node_modules`, starts `ecopages dev` on an OS-selected port, and points `baseURL` at that server. Projects that do not use `appOptions` start no worker app.

Source-mutating specs edit `app.dir`, their worker's private copy. The fixture removes that copy when the worker ends. A copy left behind by an interrupted process is replaced when that worker starts again. The server runs in its own process group so teardown also stops runtime processes started by the CLI.

Kitchen-sink HMR uses one app copy per worker. Each HMR file runs serially on its worker, while different files can run in parallel. Shared-server projects do not edit their sources.

## Add coverage

Add the spec beside its fixture and add the project to the explicit array in `playwright.config.ts`. Put docs site browser checks in the docs config. Use `e2e/app-fixture.ts` when a dev test mutates source files or needs a private dev server; use `webServer` for shared static and preview servers.

Vitest covers unit and browser-level behavior through `pnpm test:vitest`. Playwright covers behavior that needs the wired app and a real browser. The repository's CI runs `test:ci:fast` and `test:e2e:pr` on every pull request, and selects docs e2e by path. Pushes to `develop` and `main` run the full Playwright suite.

`pnpm test:e2e:ui` opens Playwright's UI. Tests run headless by default; use `playwright test --headed` or `--debug` for local inspection. Inherited `PWDEBUG` is stripped unless `--debug` is present.

Set `ECOPAGES_KEEP_E2E_TMP=true` to keep per-worker app copies after a run for debugging.
