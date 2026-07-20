# Ecopages

A **modern, basic** web framework.

No virtual DOM. No complex state management. Just TypeScript and HTML.

## Philosophy

Most frameworks require you to learn complex abstractions like hooks, signals, or reactivity systems before you can build anything. Ecopages takes the opposite approach: you write functions that return HTML. That's it.

The result is fast static pages, minimal dependencies, and code you can actually understand. When you need a server, add one. But you'll find static is often exactly what you need.

## Built With

Ecopages runs on [Bun](https://bun.sh/) and [Node.js](https://nodejs.org/), and uses [Ghtml](https://github.com/gurgunday/ghtml) for rendering. Extend it with templating integrations:

Ecopages supports multiple rendering libraries via plug-and-play integrations. Because Ecopages is an SSG framework operating at build-time, you must explicitly install both the integration plugin and its underlying renderer as development dependencies.

- **[KitaJS](https://kitajs.org/html/)** – Fast JSX template (Recommended choice)
  `pnpm add -D @ecopages/kitajs @kitajs/html`
- **[Lit](https://lit.dev/)** – Web Components with SSR
  `pnpm add -D @ecopages/lit lit`
- **[MDX](https://mdxjs.com/)** – Markdown with components
  `pnpm add -D @ecopages/mdx @mdx-js/mdx @kitajs/html`
- **[React](https://react.dev/)** – Full React ecosystem support when you need it
  `pnpm add -D @ecopages/react react react-dom`

For styling, use [Tailwind CSS](https://tailwindcss.com/) with `@apply` directives or plain CSS.

As an early-stage project, Ecopages is evolving. Feedback welcome via [GitHub](https://github.com/ecopages/ecopages).

## Current Features

## Architecture And Docs Map

The workspace now has a more explicit documentation map so architecture notes live close to the code that owns them.

### For contributors and agents

- [`AGENTS.md`](AGENTS.md) — coding standards for agents
- [`CONTEXT.md`](CONTEXT.md) — domain vocabulary

When a change affects subsystem behavior, update the local `README.md`, the parent documentation map if needed (`packages/core/README.md`, this section), and `CONTEXT.md` only when domain terms change. Other guides: [`e2e/README.md`](e2e/README.md), [`apps/docs/AGENTS.md`](apps/docs/AGENTS.md), package roots under `packages/*/`.

Start here for package-level architecture:

- `packages/core/README.md`: overall core architecture and ownership model
- `packages/core/src/config/README.md`: config build and finalized app-owned runtime state
- `packages/core/src/plugins/README.md`: integration and processor contracts
- `packages/core/src/build/README.md`: build adapter, executor, and dev-build coordination
- `packages/core/src/services/README.md`: shared runtime services, dev graph, invalidation, and browser/server seams
- `packages/core/src/adapters/README.md`: Bun and Node adapter boundaries
- `packages/core/src/dev/README.md`: dev transform server and on-demand client delivery
- `packages/core/src/hmr/README.md`: HMR strategy layer
- `packages/core/src/router/README.md`: route matching and browser navigation coordination
- `packages/core/src/route-renderer/README.md`: route rendering orchestration
- `packages/core/src/static-site-generator/README.md`: static generation flow
- `packages/core/src/eco/README.md`: `eco` authoring primitives

Domain vocabulary lives in `CONTEXT.md`, implementation details in localized READMEs, and agent rules in `AGENTS.md`. User-facing guides are on the [docs site](https://ecopages.app/docs/core/architecture).

The current direction is explicit: Bun is the primary core-owned runtime path, `createApp()` still supports direct Node fallback execution, Vite and Nitro own host-side build and dev behavior, and esbuild is no longer a strategic core dependency.

### Static Site Generation

Build fast, SEO-friendly static sites with ease.

### Lightweight Backend

Ecopages includes a type-safe, lightweight backend. Define handlers with full type inference and use explicit routing when you need dynamic features.

- **Typed Handlers**: Define API handlers with full type safety.
- **Explicit Routing**: Use `app.get`, `app.post`, etc., for dynamic routes.
- **Route API docs**: See `packages/core/README.md` for route registration patterns (`app.get`, `defineApiHandler`, `defineGroupHandler`, and API direction notes).

Use the `create-app` subpath for runtime startup and the root package for standard authoring helpers:

```ts
import { createApp } from '@ecopages/core/create-app';
import { defineApiHandler, defineGroupHandler } from '@ecopages/core';
```

Treat `@ecopages/core/bun` as an advanced escape hatch for Bun-native APIs.

### AI-Ready Documentation

We provide an `llms.txt` file to help AI agents understand and assist with your Ecopages projects.
[Read llms.txt](https://ecopages.app/llms.txt)

### Playground

Explore Ecopages' capabilities by running any of the available playgrounds:

```bash
# Run a specific playground (e.g. global, react, tailwind-v4)
pnpm --filter @ecopages/playground-global run dev

# Production start command
pnpm --filter @ecopages/playground-explicit-routes run start
```

Use workspace package names in the format `@ecopages/playground-<name>`.

### Examples

Examples under [examples](examples) are meant to behave like real consumer apps.

If you just want to install and run one directly, go into the example directory and run its normal scripts:

```bash
cd examples/starter-react
pnpm install
pnpm dev
```

If you are working inside this monorepo and want an example to use the local npm-ready `dist` packages instead of the published JSR/npm packages, use:

```bash
pnpm run example:local-npm -- examples/starter-react
```

You can also run a specific command inside the example:

```bash
pnpm run example:local-npm -- examples/starter-react pnpm exec ecopages --version
pnpm run example:local-npm -- examples/blog-react pnpm dev
pnpm run example:local-npm -- --skip-build examples/blog-react pnpm dev
```

What this does:

- builds the local npm `dist` packages
- creates a sandbox copy of the selected example under `.examples/<example-name>`
- injects local package overrides only into that sandbox copy
- installs the example against those local packages in the sandbox copy
- runs your command

Your original example files stay untouched.

The sandbox stays in `.examples`, so you can inspect it manually after the command exits.

If you are iterating on examples and already rebuilt the local npm packages, pass `--skip-build` to reuse the existing `dist` output.

### Documentation

Learn more about using Ecopages:
`pnpm run dev:docs`

For repository-local architecture notes and subsystem maps, start with the files listed in the architecture map above.

### Testing

Verify your site's functionality:
`pnpm run test:all`

The release workflow runs this same command in CI, so Playwright browser dependencies must be installed there before publishing.

### Releases

Release versioning is managed from the workspace root.

Stable bumps:

```bash
pnpm run bump:patch
pnpm run bump:minor
pnpm run bump:major
```

Promote a prerelease to stable (drops `-alpha`/`-beta` suffix without incrementing):

```bash
pnpm run bump:stable
# e.g. 0.2.0-beta.13 → 0.2.0, then pnpm run jsr:sync-version (included in bump:stable)
```

Prerelease bumps:

```bash
pnpm run bump:alpha
pnpm run bump:alpha:minor
pnpm run bump:alpha:major
pnpm run bump:beta
pnpm run bump:beta:minor
pnpm run bump:beta:major
```

Examples:

- `0.2.0-beta.13 -> 0.2.0`: `pnpm run bump:stable` (at publish time; then run `node scripts/stamp-changelogs.ts`)
- `0.2.0 -> 0.2.1`: `pnpm run bump:patch`
- `0.2.0 -> 0.3.0`: `pnpm run bump:minor`
- `0.2.0-beta.12 -> 0.2.0-beta.13`: `pnpm run bump:beta`

The bump script also supports direct usage for previews:

```bash
node --experimental-strip-types scripts/bump-version.ts promote --dry-run
node --experimental-strip-types scripts/bump-version.ts prerelease alpha minor --dry-run
node --experimental-strip-types scripts/bump-version.ts --help
```

After bumping, sync the package versions if your chosen root script did not already do it:

```bash
pnpm run jsr:sync-version
```

Changelogs: tracking begins at `0.2.0`. Keep release notes under `## [UNRELEASED] — TBD` until publish; run `node scripts/stamp-changelogs.ts` after a stable bump to create the first published entry.

Release pipeline notes:

- JSR publishing runs package by package.
- npm publishing also runs package by package.
- npm publishing uses provenance-enabled `npm publish --provenance`.
- npm publish steps skip a package if that exact version is already published.
- brand new npm packages usually require an initial manual npm-side setup before trusted publishing can work.
- Before publishing, compare each unreleased changelog line against the final implementation state and remove wording that only describes intermediate refactors instead of the shipped behavior.

## Embracing Simplicity with a Side of Verbosity

In our quest to simplify, we've made choices that sometimes lead to more verbose code. By being a bit more explicit in our code, we aim to peel back the layers of "magic" that often obscure what's happening in many modern technologies. We believe this clarity not only aids in learning but also in debugging and customizing your projects. It's all about striking the right balance between simplicity and control.

# Breaking changes

Expect breaking changes until version one is reached.
