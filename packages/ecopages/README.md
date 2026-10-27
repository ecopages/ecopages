# ecopages

The official CLI for the Ecopages framework.

It provides scaffolding and development commands to streamline your workflow. It runs your app on Node by default and on Bun when you launch it through Bun or pass `--runtime bun`, and applies runtime-specific launch behavior for each engine.

## Quick Start

Initialize a new project from the interactive template picker:

```bash
npx ecopages init
# or: pnpm dlx ecopages init
```

For a deterministic invocation, select a template explicitly:

```bash
npx ecopages init my-app --template react
cd my-app
pnpm install
pnpm dev
```

The commands above run on Node. Bun is optional: launch them through Bun (`bunx ecopages init`, `bun dev`) or pass `--runtime bun` to run the app on Bun.

## Commands

| Command               | Description                                             | What it runs                                                         |
| :-------------------- | :------------------------------------------------------ | :------------------------------------------------------------------- |
| `ecopages init [dir]` | Scaffolds a new project (interactive without `dir`)     | N/A                                                                  |
| `ecopages dev`        | Starts the dev server (supervises config/.env restarts) | `[entry] --dev` through tsx on Node, `bun run [entry] --dev` on Bun  |
| `ecopages dev:watch`  | Dev server + hard restarts on file changes              | Node: `node --watch …`; Bun: `bun --watch run [entry] --dev`         |
| `ecopages build`      | Creates a production build                              | `[entry] --build` through tsx on Node, `bun run [entry] --build`     |
| `ecopages start`      | Starts the production server from the built output      | Runs the emitted server bundle and imports `dist/.server/` modules   |
| `ecopages preview`    | Previews the production build locally                   | `[entry] --preview` through tsx on Node, `bun run [entry] --preview` |
| `ecopages types`      | Writes virtual-module types for `tsc`, then exits       | Loads `eco.config.ts` and sets processors up; the entry does not run |

> [!NOTE]
> The entry file defaults to `app.ts`. Override it with `--entry-file`.

`ecopages start` does not load `eco.config.ts`, so it finds the build output by looking for `.server/manifest.json` one level below the app root (dot-prefixed directories included). It uses the only match, fails with the matches listed when there are several, and fails with "run `ecopages build`" when there is none. Pages, Layouts, Html shells, Endpoints, `app.static` views, error pages, and `ssr: true` scripts load from `.server/server-modules.json`; a missing entry names the source file and says to run `ecopages build`. Only apps that register API or WebSocket handlers or have endpoint files build a server bundle. For a static-only app, `start` instead reports that the build has no server bundle when `dist` (or the `--dist-dir` directory) holds built HTML; serve that output with `ecopages preview` or deploy `dist/` to a static host. Pass `--dist-dir <dir>` to select a directory, which is required for nested (`out/web`) and symlinked outputs and whenever the app builds several outputs, such as `dist-<scope>` per build target.

### Templates

Official templates are versioned with the CLI release. Use `--template <id>` for an official template or `--from <source>` for a community Git template. Community sources support giget provider notation and GitHub, GitLab, Bitbucket, and SourceHut repository URLs.

```bash
ecopages init my-site --template jsx
ecopages init my-site --from github:acme/my-template#v1.0.0
```

The official template IDs are `jsx`, `html`, `react`, `react-shadcn`, `lit-jsx`, `radiant`, `blog-jsx`, `blog-react`, `docs-starter`, `react-better-auth`, and `llm-wiki`.

## Environment & Runtime Options

Server and build commands accept the following shared options. They automatically map to the equivalent environment variables for the underlying process. `--keep-going` is specific to `ecopages build`:

| Option                  | Env Var                 | Description                                               |
| :---------------------- | :---------------------- | :-------------------------------------------------------- |
| `-p, --port <port>`     | `ECOPAGES_PORT`         | Server port (default 3000)                                |
| `-n, --hostname <host>` | `ECOPAGES_HOSTNAME`     | Server hostname                                           |
| `-b, --base-url <url>`  | `ECOPAGES_BASE_URL`     | Base URL string                                           |
| `-d, --debug`           | `ECOPAGES_LOGGER_DEBUG` | Enables debug logging and startup phase trace (see below) |
| `--keep-going`          |                         | Continue exporting pages after a Page render fails        |
| `--runtime <runtime>`   |                         | Force execution via `bun` or `node`                       |

Boolean environment settings accept `true` or `1` to enable, and `false` or `0` to disable.

| Environment variable                               | Description                                                                                                                                                                                                              |
| :------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ECOPAGES_CONFIG_FILE`                             | Config path, equivalent to `--config`.                                                                                                                                                                                   |
| `ECOPAGES_PREVIEW_SERVE_ONLY`                      | For `ecopages preview`, serve existing output without rebuilding or writing to `dist/`.                                                                                                                                  |
| `ECOPAGES_DEV_TOOLBAR=false`                       | Disable the configured development toolbar for this process.                                                                                                                                                             |
| `ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS=<milliseconds>` | Set the quiet period used to batch development file changes.                                                                                                                                                             |
| `ECOPAGES_DEV_PREWARM_STATIC_ROUTES_PARALLELISM`   | Limit concurrent development prewarm renders to this positive integer.                                                                                                                                                   |
| `ECOPAGES_UNIFIED_PAGES_GRAPH=0`                   | During `ecopages build`, skip emitting `dist/.server/server-modules.json`; the bench oracle uses this for per-Page compilation. `ecopages start` always requires and loads the emitted map, regardless of this variable. |
| `ECOPAGES_REQUEST_PIPELINE_METRICS=1`              | Add request-pipeline measurements to development responses.                                                                                                                                                              |
| `ECOPAGES_ROLLDOWN_BUILD_METRICS=1`                | Log Rolldown build invocation counts.                                                                                                                                                                                    |
| `ECOPAGES_PROFILE_BUILD=1`                         | Include build profiling data in debug output.                                                                                                                                                                            |
| `ECOPAGES_STARTUP_TRACE_JSON=<path>`               | Write the startup trace report to this JSON file.                                                                                                                                                                        |
| `ECOPAGES_DEBUG=1`                                 | Log when SSR skips a browser-only custom-element script preload.                                                                                                                                                         |

### Runtime Detection

The CLI runs your app on Bun when you launch the command through Bun (`bun dev`, `bun run dev`, `bunx ecopages …`) or pass `--runtime bun`. Any other launcher (`pnpm`, `npm`, `npx`, `node`) runs it on Node.

You can explicitly force the engine using the `--runtime` flag:

```bash
ecopages build --runtime bun
```

### Example Usage

```bash
# Debug dev server on custom port
ecopages dev --port 8080 --debug
```

During `ecopages dev`, adding, changing, or removing `eco.config.ts` (or `--config`) and supported project `.env` files restarts the dev server automatically. The CLI supervises that restart and reloads dotenv files. If the restarted dev server exits with an error, for example because of an invalid config, `ecopages dev` logs the exit code and waits for the next change in the project or a linked workspace package, then starts again. When the preferred port is busy, development startup uses the same fallback flow as preview: TTY sessions show a Clack confirmation, while non-interactive sessions scan automatically only when the port was not pinned with `--port` or `ECOPAGES_PORT`.

`SIGTERM` and `SIGINT` sent to `ecopages` are forwarded to the server it started, and `ecopages` exits once that server has. `ecopages` exits with the server's exit code, or with 128 plus the signal number when a signal ended the server, for example 137 when the build is killed (SIGKILL).

### Debug logging and startup trace

Set these in `.env` or on the command line when diagnosing slow dev startup or first page load.

| Env var                              | CLI                    | What you get                                                                                   |
| :----------------------------------- | :--------------------- | :--------------------------------------------------------------------------------------------- |
| `ECOPAGES_LOGGER_DEBUG=true` or `1`  | `ecopages dev --debug` | Verbose `[@ecopages/core]` logs across the stack, plus **startup phase trace** lines on stderr |
| `ECOPAGES_STARTUP_TRACE=true` or `1` | —                      | **Only** the phase trace (no extra debug noise). Useful when measuring first-open latency      |

Trace lines are prefixed with `[ecopages:startup-trace]` and look like:

```text
[ecopages:startup-trace] phase=config-ready wallMs=1271
[ecopages:startup-trace] phase=setupAppRuntimePlugins durationMs=714 wallMs=1999
[ecopages:startup-trace] phase=route-registry durationMs=1 wallMs=2000
[ecopages:startup-trace] phase=server-listen durationMs=45 wallMs=2046
[ecopages:startup-trace] phase=dev-client-transform durationMs=42 wallMs=2100
[ecopages:startup-trace] phase=first-request-ssr durationMs=5296 wallMs=12495
[ecopages:startup-trace] summary path=/docs/getting-started/introduction bundleCount=13 clientBundleBytes=858396 wallMs=12496
```

Phases: config ready → runtime plugins → route registry → server listening → first request SSR (with per-module `dev-client-transform` on demand for `/assets/__eco_dev__/` modules). The summary includes bundle count and total client JS bytes for that first request.

```bash
# Focused perf trace only
ECOPAGES_STARTUP_TRACE=true pnpm dev

# Full debug + trace
ecopages dev --debug
```

## Ecosystem & Plugins

Ecopages relies on a modular architecture. Core logic and framework integrations are published as `@ecopages/*` packages on [npm](https://www.npmjs.com/org/ecopages).

### Official Packages

| Package                       | Description                                  |
| :---------------------------- | :------------------------------------------- |
| `@ecopages/browser-router`    | Client-side navigation & view transitions.   |
| `@ecopages/core`              | The foundational SSG engine.                 |
| `@ecopages/dev-toolbar`       | Development-only browser toolbar.            |
| `@ecopages/ecopages-jsx`      | Ecopages-owned JSX routes and hydration.     |
| `@ecopages/file-system`       | Runtime-agnostic file system utilities.      |
| `@ecopages/image-processor`   | Asset pipeline for responsive images.        |
| `@ecopages/kitajs`            | Integration for KitaJS.                      |
| `@ecopages/lit`               | Integration for Lit SSR/Islands.             |
| `@ecopages/mdx`               | Integration for standalone MDX routes.       |
| `@ecopages/postcss-processor` | CSS processing pipeline using PostCSS.       |
| `@ecopages/react`             | Integration for React 19 SSR/Islands.        |
| `@ecopages/react-router`      | React SPA routing falls back on HTTP errors. |

Explore all packages at [npmjs.com/org/ecopages](https://www.npmjs.com/org/ecopages).

## License

MIT
