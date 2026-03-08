# Ecopages

A **modern, basic** web framework.

No virtual DOM. No complex state management. Just TypeScript and HTML.

## Philosophy

Most frameworks require you to learn complex abstractions like hooks, signals, or reactivity systems before you can build anything. Ecopages takes the opposite approach: you write functions that return HTML. That's it.

The result is fast static pages, minimal dependencies, and code you can actually understand. When you need a server, add one. But you'll find static is often exactly what you need.

## Built With

Ecopages runs on [Bun](https://bun.sh/) and uses [Ghtml](https://github.com/gurgunday/ghtml) for rendering. Extend it with templating integrations:

Ecopages supports multiple rendering libraries via plug-and-play integrations. Because Ecopages is an SSG framework operating at build-time, you must explicitly install both the integration plugin and its underlying renderer as development dependencies.

- **[KitaJS](https://kitajs.org/html/)** – Fast JSX template (Recommended choice)
  `pnpm add -D @ecopages/kitajs @kitajs/html`
- **[Lit](https://lit.dev/)** – Web Components with SSR
  `pnpm add -D @ecopages/lit lit`
- **[MDX](https://mdxjs.com/)** – Markdown with components
  `pnpm add -D @ecopages/mdx @mdx-js/mdx react react-dom`
- **[React](https://react.dev/)** – Full React ecosystem support when you need it
  `pnpm add -D @ecopages/react react react-dom`

For styling, use [Tailwind CSS](https://tailwindcss.com/) with `@apply` directives or plain CSS.

As an early-stage project, Ecopages is evolving. Feedback welcome via [GitHub](https://github.com/ecopages/ecopages).

## Current Features

### Static Site Generation

Build fast, SEO-friendly static sites with ease.

### Lightweight Backend

Ecopages includes a type-safe, lightweight backend. Define handlers with full type inference and use explicit routing when you need dynamic features.

- **Typed Handlers**: Define API handlers with full type safety.
- **Explicit Routing**: Use `app.get`, `app.post`, etc., for dynamic routes.
- **Route API docs**: See `packages/core/README.md` for route registration patterns (`app.get`, `defineApiHandler`, `defineGroupHandler`, and API direction notes).

Use root imports by default:

```ts
import { EcopagesApp, defineApiHandler, defineGroupHandler } from '@ecopages/core';
```

Treat `@ecopages/core/bun` and `@ecopages/core/node` as advanced escape hatches for runtime-specific APIs.

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

### Testing

Verify your site's functionality:
`pnpm run test:all`

## Embracing Simplicity with a Side of Verbosity

In our quest to simplify, we've made choices that sometimes lead to more verbose code. By being a bit more explicit in our code, we aim to peel back the layers of "magic" that often obscure what's happening in many modern technologies. We believe this clarity not only aids in learning but also in debugging and customizing your projects. It's all about striking the right balance between simplicity and control.

# Breaking changes

Expect breaking changes until version one is reached.
