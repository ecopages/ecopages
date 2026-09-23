# llm-wiki

A persistent, LLM-maintained knowledge base. You curate sources and ask questions; the agent writes and maintains the wiki.

Based on [Andrej Karpathy's LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

## Getting started

```bash
npx ecopages init my-wiki --template llm-wiki
```

Then open the new directory in an LLM chat or coding agent and hand it [`SELF_DESTRUCT.md`](./SELF_DESTRUCT.md). It's a one-time bootstrap script: it reviews [`SCHEMA.md`](./SCHEMA.md) with you, discusses whether the default categories fit what you're documenting, asks before generating anything, does an initial ingest pass, then deletes itself (and a leftover `predev` reminder in `app/package.json`): it has no reason to stick around once the wiki is live.

If you run `pnpm dev` before doing this, a `predev` hook prints a one-line reminder to go do it first; it's silent once `SELF_DESTRUCT.md` is gone.

If you'd rather set the wiki up by hand, skip `SELF_DESTRUCT.md`, delete it (and the `predev` script in `app/package.json`), and follow [`SCHEMA.md`](./SCHEMA.md) directly.

## Layout

The vault and the site are separate on purpose: you can adopt the wiki pattern without pulling in Ecopages, or add the site later without touching your pages:

```
llm-wiki/
  wiki/              # agent-written pages (you read, the agent writes)
  sources/           # immutable raw inputs
  index.md           # content catalog for agents
  log.md             # append-only ingest/query/lint log
  SCHEMA.md          # conventions and workflows
  AGENTS.md          # agent contract
  SELF_DESTRUCT.md   # one-time bootstrap script, deletes itself after setup
  app/               # optional Ecopages site (self-contained Node package)
```

Do not edit `app/src/content/wiki`, `app/src/public/wiki`, or `app/src/content/wiki-sort-order.json` by hand. They are generated from `wiki/` during `pnpm dev` and `pnpm build`. `index.md` is also generated on ingest from page `summary` fields; do not edit it by hand.

## Site commands

From the monorepo root:

```bash
pnpm install
pnpm --filter @ecopages/template-llm-wiki dev
pnpm --filter @ecopages/template-llm-wiki build
pnpm --filter @ecopages/template-llm-wiki preview
pnpm --filter @ecopages/template-llm-wiki sync:obsidian
pnpm --filter @ecopages/template-llm-wiki lint:wiki
```

Or from `app/`:

```bash
cd app && pnpm install && pnpm dev
```

Open `/` after starting the dev server. That is the catalog of wiki pages.
`/wiki` redirects there. Set `WIKI_HOME_SLUG` to land on a specific wiki page
instead of the catalog.

## Agent markdown

```bash
curl -sH 'Accept: text/markdown' http://localhost:3333/wiki/app/demo
curl -s http://localhost:3333/wiki/app/demo.md
curl -s 'http://localhost:3333/wiki/app/demo?format=md'
curl -s http://localhost:3333/api/wiki/app/demo
curl -s 'http://localhost:3333/api/search?q=demo'
```

The static `preview` server supports the generated `.md` files and browser search index, but it does not serve `/api/search`, `/api/wiki/...`, or request-header negotiation. Use `dev` or `start` for those server features.

See [SCHEMA.md](./SCHEMA.md) for page categories, frontmatter, ordering, and maintenance. Site architecture: [app/README.md](./app/README.md).
