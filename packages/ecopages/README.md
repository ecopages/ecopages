# ecopages

The official CLI for the Ecopages framework.

It provides scaffolding and development commands to streamline your workflow. It prefers Bun when available, falls back to Node otherwise, and applies runtime-specific launch behavior for each engine.

## Quick Start

Initialize a new project from the default template:

```bash
bunx ecopages init my-app
cd my-app
bun install
bun dev
```

## Commands

| Command                      | Description                                | Equivalent (Bun)                |
| :--------------------------- | :----------------------------------------- | :------------------------------ |
| `ecopages init <dir>`        | Scaffolds a new project                    | N/A                             |
| `ecopages dev [entry]`       | Starts the dev server                      | `bun run [entry] --dev`         |
| `ecopages dev:watch [entry]` | Dev server + hard restarts on file changes | `bun --watch run [entry] --dev` |
| `ecopages dev:hot [entry]`   | Dev server + HMR (no hard restarts)        | `bun --hot run [entry] --dev`   |
| `ecopages build [entry]`     | Creates a production build                 | `bun run [entry] --build`       |
| `ecopages start [entry]`     | Starts the production server               | `bun run [entry]`               |
| `ecopages preview [entry]`   | Previews the production build locally      | `bun run [entry] --preview`     |

> [!NOTE]
> `[entry]` defaults to `app.ts` if not provided.

## Environment & Runtime Options

Server and build commands accept the following options. They automatically map to the equivalent environment variables for the underlying process:

| Option                     | Env Var                 | Description                                               |
| :------------------------- | :---------------------- | :-------------------------------------------------------- |
| `-p, --port <port>`        | `ECOPAGES_PORT`         | Server port (default 3000)                                |
| `-n, --hostname <host>`    | `ECOPAGES_HOSTNAME`     | Server hostname                                           |
| `-b, --base-url <url>`     | `ECOPAGES_BASE_URL`     | Base URL string                                           |
| `-d, --debug`              | `ECOPAGES_LOGGER_DEBUG` | Enables debug logging and startup phase trace (see below) |
| `-r, --react-fast-refresh` |                         | Enables React Fast Refresh                                |
| `--runtime <runtime>`      |                         | Force execution via `bun` or `node`                       |

### Runtime Detection

The CLI prefers Bun when the package manager already indicates Bun, when the `Bun` global is available, or when you force it with `--runtime bun`. Otherwise it falls back to Node.

You can explicitly force the engine using the `--runtime` flag:

```bash
ecopages build --runtime bun
```

### Example Usage

```bash
# Debug dev server on custom port
ecopages dev --port 8080 --debug

# Dev server with React Fast Refresh enabled
ecopages dev -r
```

### Debug logging and startup trace

Set these in `.env` or on the command line when diagnosing slow dev startup or first page load.

| Env var                                        | CLI                    | What you get                                                                                   |
| :--------------------------------------------- | :--------------------- | :--------------------------------------------------------------------------------------------- |
| `ECOPAGES_LOGGER_DEBUG=true`                   | `ecopages dev --debug` | Verbose `[@ecopages/core]` logs across the stack, plus **startup phase trace** lines on stderr |
| `ECOPAGES_STARTUP_TRACE=true`                  | —                      | **Only** the phase trace (no extra debug noise). Useful when measuring first-open latency      |
| `ECOPAGES_DEV_COLD_CLIENT_GRAPH=false`         | —                      | Disable background React HMR entrypoint prewarm (on by default when HMR is enabled)            |
| `ECOPAGES_DEV_COLD_CLIENT_GRAPH_BLOCKING=true` | —                      | Delay startup completion until prewarm finishes (default runs in background after listen)      |

Trace lines are prefixed with `[ecopages:startup-trace]` and look like:

```text
[ecopages:startup-trace] phase=config-ready wallMs=1271
[ecopages:startup-trace] phase=setupAppRuntimePlugins durationMs=714 wallMs=1999
[ecopages:startup-trace] phase=route-registry durationMs=1 wallMs=2000
[ecopages:startup-trace] phase=server-listen durationMs=45 wallMs=2046
[ecopages:startup-trace] phase=dev-cold-client-graph durationMs=733 wallMs=2779
[ecopages:startup-trace] phase=first-request-ssr durationMs=5296 wallMs=12495
[ecopages:startup-trace] summary path=/docs/getting-started/introduction bundleCount=13 clientBundleBytes=858396 wallMs=12496
```

Phases: config ready → runtime plugins → route registry → server listening → **dev cold client graph** (React HMR entrypoint prewarm, usually in background after listen) → first request SSR. The summary includes bundle count and total client JS bytes for that first request.

```bash
# Focused perf trace only
ECOPAGES_STARTUP_TRACE=true pnpm dev

# Full debug + trace
ecopages dev --debug
```

## Ecosystem & Plugins

Ecopages relies on a modular architecture. Core logic and framework integrations are published as `@ecopages/*` packages on [npm](https://www.npmjs.com/org/ecopages).

### Official Packages

| Package                       | Description                                |
| :---------------------------- | :----------------------------------------- |
| `@ecopages/browser-router`    | Client-side navigation & view transitions. |
| `@ecopages/codemod`           | AST migrations for codebase upgrades.      |
| `@ecopages/core`              | The foundational SSG engine.               |
| `@ecopages/ecopages-jsx`      | Ecopages-owned JSX routes and hydration.   |
| `@ecopages/file-system`       | Runtime-agnostic file system utilities.    |
| `@ecopages/image-processor`   | Asset pipeline for responsive images.      |
| `@ecopages/kitajs`            | Integration for KitaJS.                    |
| `@ecopages/lit`               | Integration for Lit SSR/Islands.           |
| `@ecopages/mdx`               | Integration for standalone MDX routes.     |
| `@ecopages/postcss-processor` | CSS processing pipeline using PostCSS.     |
| `@ecopages/react`             | Integration for React 19 SSR/Islands.      |
| `@ecopages/react-router`      | SPA routing for React.                     |

Explore all packages at [npmjs.com/org/ecopages](https://www.npmjs.com/org/ecopages).

## License

MIT
