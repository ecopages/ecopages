# Ecopages

A **modern, basic** web framework.

No virtual DOM. No complex state management. Just TypeScript and HTML.

## Philosophy

Most frameworks require you to learn complex abstractions like hooks, signals, or reactivity systems before you can build anything. Ecopages takes the opposite approach: you write functions that return HTML. That's it.

The result is fast static pages, minimal dependencies, and code you can actually understand. When you need a server, add one. But you'll find static is often exactly what you need.

## Built With

Ecopages runs on [Bun](https://bun.sh/) and [Node.js](https://nodejs.org/). Start with the first-party Ecopages JSX integration, or register another Integration that owns the route file types you use.

Ecopages supports multiple rendering libraries via plug-and-play integrations. Because Ecopages is an SSG framework operating at build-time, you must explicitly install both the integration plugin and its underlying renderer as development dependencies.

- **Ecopages JSX** – Ecopages-owned JSX routes and optional Radiant hydration (Recommended choice)
  `pnpm add -D @ecopages/ecopages-jsx @ecopages/jsx @ecopages/radiant`
- **[KitaJS](https://kitajs.org/html/)** – Fast JSX template
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

### Agent-facing documentation

The public docs site publishes a discovery index at [ecopages.app/llms.txt](https://ecopages.app/llms.txt). That file is an index: follow its links to `/docs-llm/<section>/<slug>.md` for page bodies, or start at [ecopages.app/skill.txt](https://ecopages.app/skill.txt) for a progressive build guide.

New apps do not get this automatically. The `docs-starter` template shows the generate-before-dev/build pattern.

### Playground

Explore Ecopages' capabilities by running any of the available playgrounds:

```bash
# Run a specific playground (e.g. global, react, tailwind-v4)
pnpm --filter @ecopages/playground-global run dev

# Production start command
pnpm --filter @ecopages/playground-explicit-routes run start
```

Use workspace package names in the format `@ecopages/playground-<name>`.

### Templates

Templates under [templates](templates) are meant to behave like real consumer apps.

If you just want to install and run one directly, go into the template directory and run its normal scripts:

```bash
cd templates/react
pnpm install
pnpm dev
```

If you are working inside this monorepo and want a template to use the local npm-ready `dist` packages instead of the published npm packages, use:

```bash
pnpm run template:local-npm -- templates/react
```

You can also run a specific command inside the template:

```bash
pnpm run template:local-npm -- templates/react pnpm exec ecopages --version
pnpm run template:local-npm -- templates/blog-react pnpm dev
pnpm run template:local-npm -- --skip-build templates/blog-react pnpm dev
```

What this does:

- builds the local npm `dist` packages
- creates a sandbox copy of the selected template under `.templates/<template-name>`
- materializes local workspace packages as file dependencies only in that sandbox copy
- installs the template against those local packages in the sandbox copy
- runs your command

Your original template files stay untouched.

The sandbox stays in `.templates`, so you can inspect it manually after the command exits.

If you are iterating on templates and already rebuilt the local npm packages, pass `--skip-build` to reuse the existing `dist` output.

### Documentation

Learn more about using Ecopages:
`pnpm run dev:docs`

For repository-local architecture notes and subsystem maps, start with the files listed in the architecture map above.

### Testing

Verify your site's functionality:
`pnpm run test:all`

CI runs the fast gate on pull requests and the e2e gate on `main`.

### Releases

Record a user-facing change with Changesets, then let the Publish workflow version and publish:

```bash
pnpm changeset
```

Commit the generated file under `.changeset/`. Do not bump `package.json` versions or edit `CHANGELOG.md` by hand.

Public packages are a **fixed** group: they always share one version. The Publish workflow builds each package `dist` and publishes that folder to npm (`publishConfig.directory`). The install entrypoint is the `ecopages` CLI.

How versioning, prereleases, and branch selection work: [`.changeset/README.md`](.changeset/README.md).

## Embracing Simplicity with a Side of Verbosity

In our quest to simplify, we've made choices that sometimes lead to more verbose code. By being a bit more explicit in our code, we aim to peel back the layers of "magic" that often obscure what's happening in many modern technologies. We believe this clarity not only aids in learning but also in debugging and customizing your projects. It's all about striking the right balance between simplicity and control.

# Breaking changes

Expect breaking changes until version one is reached.
