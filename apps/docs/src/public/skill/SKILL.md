---
name: building-with-ecopages
description: >-
    Guides agents building Ecopages static sites and hybrid apps — integrations,
    processors, eco.config.ts, eco.page/component, and API handlers. Use when
    scaffolding, configuring, or extending an Ecopages project.
---

# Building with Ecopages

Ecopages is a TypeScript-first static site generator with Bun and Node adapters. It is explicit, integration-agnostic, and static by default.

## When to use this skill

Read this skill when the task involves:

- Scaffolding or configuring an Ecopages app (`eco.config.ts`, processors, integrations)
- Choosing a rendering Integration (default: Ecopages JSX; KitaJS for `.kita.tsx` / `@kitajs/html`)
- Authoring pages, components, handlers, or custom processors/integrations
- Styling with Tailwind v4 and PostCSS

For the page index, use [/llms.txt](/llms.txt). Follow its links to `/docs-llm/<section>/<slug>.md` for full page bodies. Do not treat `llms.txt` as a dump of every document.

## Stack choice

Default to **Ecopages JSX** (`ecopagesJsxPlugin()`, `.tsx`). Use **KitaJS** (`kitajsPlugin()`, `.kita.tsx`) when Pages should compile with `@kitajs/html`.

| Integration        | Owns                    | Notes                                                                                |
| ------------------ | ----------------------- | ------------------------------------------------------------------------------------ |
| **Ecopages JSX**   | `.tsx` Pages (default)  | Optional Radiant; optional MDX via `ecopagesJsxPlugin({ mdx: { enabled: true } })`   |
| **React**          | React Pages and islands | Use `reactPlugin({ mdx: { enabled: true } })` for React MDX                          |
| **Lit**            | Web components, SSR     | Foreign-child ownership in the renderer                                              |
| **Standalone MDX** | Third-party JSX runtime | `mdxPlugin({ compilerOptions: { jsxImportSource } })` — not React or `@ecopages/jsx` |
| **KitaJS**         | `.kita.tsx` Pages       | `@kitajs/html`                                                                       |

Do not treat Ecopages as a React-only framework.

## Reference modules

Read only the modules relevant to the task. Each file is one level deep from this entry.

| Module                                                                     | Read when                                                                        |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [reference/getting-started.md](reference/getting-started.md)               | Init, install, `eco.config.ts`, `app.ts`, scripts                                |
| [reference/core.md](reference/core.md)                                     | `eco.page` / `eco.component`, project structure, dependencies, metadata, layouts |
| [reference/integrations.md](reference/integrations.md)                     | Picking or mixing integrations, MDX ownership rules                              |
| [reference/processors-and-plugins.md](reference/processors-and-plugins.md) | PostCSS, images, custom processors, source transforms, plugin lifecycle          |
| [reference/server.md](reference/server.md)                                 | `defineApiHandler`, `defineGroupHandler`, pages vs views                         |
| [reference/styling.md](reference/styling.md)                               | Tailwind v4, PostCSS processor, CSS imports                                      |
| [reference/full-stack.md](reference/full-stack.md)                         | Better Auth, Drizzle, protected routes                                           |

## Critical rules

1. Declare script and stylesheet dependencies explicitly in `eco.component()` / `eco.page()` — Ecopages does not infer them from filenames.
2. Use `eco.page()` for routable pages; use `src/views/` for handler-rendered views.
3. Match MDX to the owning integration: React MDX via `reactPlugin`, Ecopages JSX MDX via `ecopagesJsxPlugin`, standalone via `mdxPlugin` with explicit `jsxImportSource`.
4. Register processors with factory functions: `postcssProcessorPlugin()`, `imageProcessorPlugin({ options })`.
5. Processor build plugins use `EcoBuildPlugin`, not Bun-specific plugin types.
6. Core owns plugin lifecycle ordering — see `reference/processors-and-plugins.md` before authoring custom plugins.

## Resources

Start with this skill pack for app work. For the full docs index see [llms.txt](/llms.txt); page exports live under `/docs-llm/.../*.md`.

- [Ecopages templates](https://github.com/ecopages/ecopages/tree/main/templates)
