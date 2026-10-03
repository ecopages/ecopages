# LLM Wiki site (`app/`)

Self-contained Ecopages app that renders the parent [`../wiki`](../wiki) vault as browsable docs at `/wiki`. Run package commands from this directory; the CLI manifest marks it as the runnable package directory.

Framework skill packs live in the vault root at [`../.agents`](../.agents). See [`../AGENTS.md`](../AGENTS.md).

## Content pipeline

- Source of truth: `../wiki/`. The default auto mode accepts either category
  directories (`wiki/<category>/<page>.md`) or flat files with `category` in
  frontmatter; mixed layouts fail fast.
- Generated: `src/content/wiki` and `src/public/wiki` are written from the vault on every `pnpm dev` / `pnpm build`. Ingest replaces a file that already exists and does not delete directories. A page you remove from the vault stays in the generated folders until you delete that file.
- Ingest: `src/lib/wiki/ingest.ts` validates frontmatter, normalizes both layouts to
  category/page slugs, and regenerates `../index.md`. Link rewrite lives in `src/lib/wiki/links.ts`.
- Nav / sort: the root `../wiki/sortspec.md` orders categories; each category's `sortspec.md` orders pages. Ingest writes the result to `src/content/wiki-sort-order.json`.

## Systems (`src/lib`)

| System          | Role                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| **obsidian**    | Build-plugin watch/rebuild, and `pnpm sync:obsidian` which asks before copying into the vault               |
| **wiki**        | Vault load, ingest, catalog, graph lint, link rewrite, catch-all slugs ([README](./src/lib/wiki/README.md)) |
| **md-response** | Markdown negotiation (`Accept`, `.md` suffix, `/api/wiki/[...slug]`)                                        |
| **search**      | Token search engine, `/api/search` for agents, `search-index.json` for the browser                          |
| **cx**          | `cx(...classes)` — join class names, skip falsy values                                                      |

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
pnpm sync:obsidian
pnpm lint:wiki
pnpm test
pnpm typecheck
```

`pnpm sync:obsidian` shows the destination directory and asks before copying. A second question asks whether to clear that directory. The default is no, so existing unrelated files stay. `pnpm sync:obsidian -- --yes` copies without asking. Add `--clear` to delete the destination first, including with `--yes`. The command throws when `OBSIDIAN_VAULT_PATH` is unset.

## Agent markdown

```bash
curl -sH 'Accept: text/markdown' http://localhost:3333/wiki/app/demo
curl -s http://localhost:3333/wiki/app/demo.md
curl -s 'http://localhost:3333/wiki/app/demo?format=md'
curl -s http://localhost:3333/api/wiki/app/demo
curl -s 'http://localhost:3333/api/search?q=demo'
```

HTML pages advertise `<link rel="alternate" type="text/markdown">`. `/api/search`, `/api/wiki/...`, and Accept negotiation require `dev` or `start`; static `preview` serves the generated `.md` files and `search-index.json` only.

## Layout data

The wiki Page uses the existing `layout.props` factory to resolve DocsLayout data from route params. Its static props and layout factory share the same entry lookup. Core and integrations retain their existing explicit layout-props contract.

Catalog generation preserves pages with duplicate titles. Wiki graph lint resolves inline and reference links while ignoring code examples and images. The Obsidian mirror uses explicit TypeScript import extensions so Node can run it directly.

Run `pnpm build` or `pnpm dev` before `pnpm typecheck` to generate the collection declarations. The template declares TypeScript and Bun typings explicitly for checking workspace framework sources; `allowImportingTsExtensions` supports Node’s explicit `.ts` imports without emitting JavaScript.
