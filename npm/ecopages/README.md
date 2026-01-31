# ecopages

> **DRAFT / EXPERIMENTAL**
> This package is currently in a draft state and is subject to significant changes.

`ecopages` is a CLI tool for the Ecopages framework. It provides:

- **Project scaffolding**: Quickly initialize new Ecopages projects from templates using `bunx ecopages init`
- **Command utilities**: Namespaced commands that wrap common Bun operations, automatically detecting and applying your `eco.config.ts`

## Quick Start

Initialize a new project:

```bash
bunx ecopages init my-app
cd my-app
bun install
bun dev
```

## CLI Utilities

### Commands

| Command                      | Description                                      | Bun Equivalent                  |
| :--------------------------- | :----------------------------------------------- | :------------------------------ |
| `ecopages init <dir>`        | Initialize a new Ecopages project                | scaffolding tool                |
| `ecopages dev [entry]`       | Start the development server                     | `bun run [entry] --dev`         |
| `ecopages dev:watch [entry]` | Start with watch mode (restarts on file changes) | `bun --watch run [entry] --dev` |
| `ecopages dev:hot [entry]`   | Start with hot reload (HMR without restart)      | `bun --hot run [entry] --dev`   |
| `ecopages build [entry]`     | Build for production                             | `bun run [entry] --build`       |
| `ecopages start [entry]`     | Start production server                          | `bun run [entry]`               |
| `ecopages preview [entry]`   | Preview production build                         | `bun run [entry] --preview`     |

> **Note:** `[entry]` defaults to `app.ts` if not provided.

### Environment Overrides

All server commands (`dev`, `dev:watch`, `dev:hot`, `start`, `preview`) support the following options:

| Option                     | Environment Variable    | Description                   |
| :------------------------- | :---------------------- | :---------------------------- |
| `-p, --port <port>`        | `ECOPAGES_PORT`         | Server port (default 3000)    |
| `-n, --hostname <host>`    | `ECOPAGES_HOSTNAME`     | Server hostname               |
| `-b, --base-url <url>`     | `ECOPAGES_BASE_URL`     | Base URL for the app          |
| `-d, --debug`              | `ECOPAGES_LOGGER_DEBUG` | Enable debug logging          |
| `-r, --react-fast-refresh` | -                       | Enable React Fast Refresh HMR |

**Example:**

```bash
# Start dev server on port 8080 with debug logging
ecopages dev --port 8080 --debug

# Start dev server with React Fast Refresh
ecopages dev -r

# Start production server with custom hostname
ecopages start --hostname 0.0.0.0 --port 3001
```

## Ecopages Packages

The Ecopages ecosystem consists of individual framework packages published to [JSR](https://jsr.io/@ecopages). Import them directly in your project:

```typescript
import { eco } from '@ecopages/core';
import { kitajsPlugin } from '@ecopages/kitajs';
```

### Available Packages

| Package                           | Description                                               | JSR Link                                              |
| :-------------------------------- | :-------------------------------------------------------- | :---------------------------------------------------- |
| `@ecopages/browser-router`        | Client-side navigation and view transitions for Ecopages. | [JSR](https://jsr.io/@ecopages/browser-router)        |
| `@ecopages/bun-inline-css-plugin` | Bun plugin to process CSS files using CSS Processors.     | [JSR](https://jsr.io/@ecopages/bun-inline-css-plugin) |
| `@ecopages/bun-mdx-kitajs-loader` | Bun loader to load MDX files with KitaJS.                 | [JSR](https://jsr.io/@ecopages/bun-mdx-kitajs-loader) |
| `@ecopages/bun-postcss-loader`    | Bun loader to load PostCSS files.                         | [JSR](https://jsr.io/@ecopages/bun-postcss-loader)    |
| `@ecopages/core`                  | Foundational layer of the Ecopages ecosystem.             | [JSR](https://jsr.io/@ecopages/core)                  |
| `@ecopages/file-system`           | Runtime-agnostic file system utilities (Bun/Node.js).     | [JSR](https://jsr.io/@ecopages/file-system)           |
| `@ecopages/image-processor`       | Image processing library for optimized responsive images. | [JSR](https://jsr.io/@ecopages/image-processor)       |
| `@ecopages/kitajs`                | KitaJS plugin for Ecopages integration.                   | [JSR](https://jsr.io/@ecopages/kitajs)                |
| `@ecopages/lit`                   | Lit plugin for Ecopages integration.                      | [JSR](https://jsr.io/@ecopages/lit)                   |
| `@ecopages/mdx`                   | MDX plugin for Ecopages integration.                      | [JSR](https://jsr.io/@ecopages/mdx)                   |
| `@ecopages/postcss-processor`     | Utility functions for processing CSS with PostCSS.        | [JSR](https://jsr.io/@ecopages/postcss-processor)     |
| `@ecopages/react`                 | React plugin for Ecopages integration.                    | [JSR](https://jsr.io/@ecopages/react)                 |
| `@ecopages/react-router`          | Client-side SPA router for Ecopages React apps.           | [JSR](https://jsr.io/@ecopages/react-router)          |

Explore all packages at [jsr.io/@ecopages](https://jsr.io/@ecopages).

## Installation

```bash
bun add ecopages
```

To use Ecopages packages in your project, create a `.npmrc` file in the root of your project to configure JSR registry resolution:

```ini
@jsr:registry=https://npm.jsr.io
```

Then add the packages you need:

```bash
bun jsr add @ecopages/core @ecopages/kitajs
```

## License

MIT
