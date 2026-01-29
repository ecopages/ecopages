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

| Command              | Description                  | Bun Equivalent                 |
| :------------------- | :--------------------------- | :----------------------------- |
| `ecopages dev`       | Start the development server | `bun run app.ts --dev`         |
| `ecopages dev:watch` | Start with watch mode        | `bun --watch run app.ts --dev` |
| `ecopages dev:hot`   | Start with hot reload        | `bun --hot run app.ts --dev`   |
| `ecopages build`     | Build for production         | `bun run app.ts --build`       |
| `ecopages start`     | Start production server      | `bun run app.ts`               |
| `ecopages preview`   | Preview production build     | `bun run app.ts --preview`     |

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

## License

MIT
