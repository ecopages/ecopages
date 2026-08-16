# llm-wiki

A persistent, LLM-maintained knowledge base. You curate sources and ask questions; the agent writes and maintains the wiki.

Based on [Andrej Karpathy's LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

## Layout

The vault and the site are separate on purpose — you can adopt the wiki pattern without pulling in Ecopages, or add the site later without touching your pages:

```
llm-wiki/
  wiki/          # agent-written pages (you read, the agent writes)
  sources/       # immutable raw inputs
  index.md       # content catalog for agents
  log.md         # append-only ingest/query/lint log
  SCHEMA.md      # conventions and workflows
  AGENTS.md      # agent contract
  app/           # optional Ecopages site (self-contained Node package)
```

Do not edit `app/src/content/wiki` or `app/src/content/wiki-sort-order.json` by hand. They are generated from `wiki/` during `pnpm dev` and `pnpm build`.

## Site commands

From the monorepo root:

```bash
pnpm install
pnpm --filter @ecopages/template-llm-wiki dev
pnpm --filter @ecopages/template-llm-wiki build
pnpm --filter @ecopages/template-llm-wiki preview
pnpm --filter @ecopages/template-llm-wiki sync:obsidian
```

Or from `app/`:

```bash
cd app && pnpm install && pnpm dev
```

Open `/` or `/wiki` after starting the dev server. Both redirect to the first
sorted wiki page (the bundled vault redirects to `/wiki/app/demo`). Set
`WIKI_HOME_SLUG` to choose a different landing page.

## Agent markdown

```bash
curl -sH 'Accept: text/markdown' http://localhost:3333/wiki/app/demo
curl -s http://localhost:3333/wiki/app/demo.md
curl -s 'http://localhost:3333/wiki/app/demo?format=md'
curl -s 'http://localhost:3333/api/search?q=demo'
```

The static `preview` server supports the generated `.md` files and browser search index, but it does not serve `/api/search` or request-header negotiation. Use `dev` or `start` for those server features.

See [SCHEMA.md](./SCHEMA.md) for page categories, frontmatter, ordering, and maintenance. Site architecture: [app/README.md](./app/README.md).
