# ecopages

The official CLI for the Ecopages framework.

It provides scaffolding and development commands to streamline your workflow. It natively wraps your execution environment (Bun or Node) and automatically detects your `eco.config.ts`.

## Quick Start

Initialize a new project from the default template:

```bash
bunx ecopages init my-app
cd my-app
bun install
bun dev
```

## Commands

| Command                      | Description                                | Equivalent (Bun)                | Equivalent (Node)                         |
| :--------------------------- | :----------------------------------------- | :------------------------------ | :---------------------------------------- |
| `ecopages init <dir>`        | Scaffolds a new project                    | N/A                             | N/A                                       |
| `ecopages dev [entry]`       | Starts the dev server                      | `bun run [entry] --dev`         | `node [ecopages thin host] [entry] --dev` |
| `ecopages dev:watch [entry]` | Dev server + hard restarts on file changes | `bun --watch run [entry] --dev` | `node --watch [ecopages thin host] ...`   |
| `ecopages dev:hot [entry]`   | Dev server + HMR (no hard restarts)        | `bun --hot run [entry] --dev`   | N/A                                       |
| `ecopages build [entry]`     | Creates a production build                 | `bun run [entry] --build`       | `node [ecopages thin host] [entry] --build` |
| `ecopages start [entry]`     | Starts the production server               | `bun run [entry]`               | `node [ecopages thin host] [entry]`       |
| `ecopages preview [entry]`   | Previews the production build locally      | `bun run [entry] --preview`     | `node [ecopages thin host] [entry] --preview` |

> [!NOTE]
> `[entry]` defaults to `app.ts` if not provided.

## Environment & Runtime Options

Server and build commands accept the following options. They automatically map to the equivalent environment variables for the underlying process:

| Option                     | Env Var                 | Description                             |
| :------------------------- | :---------------------- | :-------------------------------------- |
| `-p, --port <port>`        | `ECOPAGES_PORT`         | Server port (default 3000)              |
| `-n, --hostname <host>`    | `ECOPAGES_HOSTNAME`     | Server hostname                         |
| `-b, --base-url <url>`     | `ECOPAGES_BASE_URL`     | Base URL string                         |
| `-d, --debug`              | `ECOPAGES_LOGGER_DEBUG` | Enables debug-level logging             |
| `-r, --react-fast-refresh` |                         | Enables React Fast Refresh              |
| `--runtime <runtime>`      |                         | Force execution via `bun`, `node`, or `node-experimental` |

### Runtime Detection

The CLI automatically detects your runtime environments by inspecting the package manager (`npm_config_user_agent`) or whether the `Bun` global exists. If neither is forcing Bun, it executes your app through the Ecopages-owned Node thin host.

Both `node` and `node-experimental` now launch through the thin-host boundary and hand off the same serialized Node runtime manifest. `node-experimental` remains available as an explicit verification alias while the unified Node host path continues to settle.

You can explicitly force the engine using the `--runtime` flag:

```bash
ecopages dev --runtime node
ecopages build --runtime bun
ecopages dev --runtime node-experimental
```

### Example Usage

```bash
# Debug dev server on custom port
ecopages dev --port 8080 --debug

# Dev server with React Fast Refresh enabled
ecopages dev -r
```

## Ecosystem & Plugins

Ecopages relies on a modular architecture. Core logic and framework integrations are published separately to [JSR](https://jsr.io/@ecopages).

Configure your project to use JSR by adding a `.npmrc` file:

```ini
@jsr:registry=https://npm.jsr.io
```

### Official Packages

| Package                       | Description                                |
| :---------------------------- | :----------------------------------------- |
| `@ecopages/browser-router`    | Client-side navigation & view transitions. |
| `@ecopages/codemod`           | AST migrations for codebase upgrades.      |
| `@ecopages/core`              | The foundational SSG engine.               |
| `@ecopages/file-system`       | Runtime-agnostic file system utilities.    |
| `@ecopages/image-processor`   | Asset pipeline for responsive images.      |
| `@ecopages/kitajs`            | Integration for KitaJS.                    |
| `@ecopages/lit`               | Integration for Lit SSR/Islands.           |
| `@ecopages/mdx`               | Integration for standalone MDX routes.     |
| `@ecopages/postcss-processor` | CSS processing pipeline using PostCSS.     |
| `@ecopages/react`             | Integration for React 19 SSR/Islands.      |
| `@ecopages/react-router`      | SPA routing for React.                     |

Explore all packages at [jsr.io/@ecopages](https://jsr.io/@ecopages).

## License

MIT
