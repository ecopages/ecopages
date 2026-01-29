# ecopages

> **DRAFT / EXPERIMENTAL**
> This package is currently in a draft state and is subject to significant changes. Use with caution in production environments.

`ecopages` is the centralized entry point for the Ecopages ecosystem. It provides a unified way to access all `@ecopages/*` library packages and includes powerful CLI utilities to streamline your development workflow with Bun.

## Overview

Instead of managing multiple `@ecopages` dependencies, you can simply use the `ecopages` meta-package. It re-exports all essential library components while maintaining full tree-shakability.

### Sub-path Exports

You can import from specific Ecopages modules directly through the meta-package:

```typescript
import { eco } from 'ecopages/core';
import { kitajsPlugin } from 'ecopages/kitajs';
```

## CLI Utilities

The `ecopages` package includes a CLI to simplify common Bun commands. It automatically detects your `eco.config.ts` and applies the necessary preloads.

### Commands

| Command                      | Description                                      | Bun Equivalent                  |
| :--------------------------- | :----------------------------------------------- | :------------------------------ |
| `ecopages dev [entry]`       | Start the development server                     | `bun run [entry] --dev`         |
| `ecopages dev:watch [entry]` | Start with watch mode (restarts on file changes) | `bun --watch run [entry] --dev` |
| `ecopages dev:hot [entry]`   | Start with hot reload (HMR without restart)      | `bun --hot run [entry] --dev`   |
| `ecopages build [entry]`     | Build for production                             | `bun run [entry] --build`       |
| `ecopages start [entry]`     | Start production server                          | `bun run [entry]`               |
| `ecopages preview [entry]`   | Preview production build                         | `bun run [entry] --preview`     |

> **Note:** `[entry]` defaults to `app.ts` if not provided.

### Environment Overrides

All server commands (`dev`, `dev:watch`, `dev:hot`, `start`, `preview`) support the following options:

| Option                  | Environment Variable    | Description                |
| :---------------------- | :---------------------- | :------------------------- |
| `-p, --port <port>`     | `ECOPAGES_PORT`         | Server port (default 3000) |
| `-n, --hostname <host>` | `ECOPAGES_HOSTNAME`     | Server hostname            |
| `-b, --base-url <url>`  | `ECOPAGES_BASE_URL`     | Base URL for the app       |
| `-d, --debug`           | `ECOPAGES_LOGGER_DEBUG` | Enable debug logging       |

**Example:**

```bash
# Start dev server on port 8080 with debug logging
ecopages dev --port 8080 --debug

# Start production server with custom hostname
ecopages start --hostname 0.0.0.0 --port 3001
```

## JSR Packages

The individual Ecopages packages are published to [JSR](https://jsr.io/@ecopages). This meta-package re-exports them for easier consumption via NPM while leveraging Bun's performance.

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

## Configuration

To use Ecopages packages, which are published on JSR, you need to configure your package manager to resolve the `@jsr` scope.

### npm / pnpm / Yarn

Create a `.npmrc` file in the root of your project with the following content:

```ini
@jsr:registry=https://npm.jsr.io
```

### Bun

Bun supports JSR natively, but if you are using the `npm:` aliasing strategy (as recommended for compatibility), having the `.npmrc` file ensures consistent behavior.

## License

MIT
