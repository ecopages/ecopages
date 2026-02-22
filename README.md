# Ecopages

A **modern, basic** web framework.

No virtual DOM. No complex state management. Just TypeScript and HTML.

## Philosophy

Most frameworks require you to learn complex abstractions like hooks, signals, or reactivity systems before you can build anything. Ecopages takes the opposite approach: you write functions that return HTML. That's it.

The result is fast static pages, minimal dependencies, and code you can actually understand. When you need a server, add one. But you'll find static is often exactly what you need.

## Built With

Ecopages runs on [Bun](https://bun.sh/) and uses [Ghtml](https://github.com/gurgunday/ghtml) for rendering. Extend it with templating integrations:

- **[KitaJS](https://kitajs.org/html/)** – Fast JSX template (Recommended choice)
- **[Lit](https://lit.dev/)** – Web Components with SSR
- **[MDX](https://mdxjs.com/)** – Markdown with components
- **[React](https://react.dev/)** – Full React ecosystem support when you need it

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

### AI-Ready Documentation

We provide an `llms.txt` file to help AI agents understand and assist with your Ecopages projects.
[Read llms.txt](https://ecopages.app/llms.txt)

### Playground

Explore Ecopages' capabilities by running any of the available playgrounds:

```bash
# Run a specific playground (e.g. global, react, tailwind-v4)
bun run --filter @ecopages/playground-global dev

# Run using node instead of bun
npm run --workspace=@ecopages/playground-react dev

# Production start command
bun run --filter @ecopages/playground-explicit-routes start
```

Use workspace package names in the format `@ecopages/playground-<name>`.

### Documentation

Learn more about using Ecopages:

`bun run dev:docs`

### Testing

Verify your site's functionality:

`bun test --coverage`

## Embracing Simplicity with a Side of Verbosity

In our quest to simplify, we've made choices that sometimes lead to more verbose code. By being a bit more explicit in our code, we aim to peel back the layers of "magic" that often obscure what's happening in many modern technologies. We believe this clarity not only aids in learning but also in debugging and customizing your projects. It's all about striking the right balance between simplicity and control.

# Breaking changes

Expect breaking changes until version one is reached.
