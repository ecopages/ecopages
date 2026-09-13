# wiki

Vault catalog, collection access, catch-all slugs, graph lint, ingest, and wiki link rewriting.

| Module | Role |
| --- | --- |
| `is-enoent.ts` | Shared `ENOENT` guard for vault, catalog, lint, and ingest |
| `vault.ts` | Read pages and sortspec from `wiki/` |
| `ingest.ts` | Vault → generated collection, catalog rewrite, source copy |
| `catalog.ts` | Idempotent vault-root `index.md` from page `summary` fields |
| `links.ts` | Wiki markdown link resolution (ingest, lint, MDX remark) |
| `lint.ts` | Graph lint (`pnpm lint:wiki`) |
| `collection.ts` | Generated collection access and `WIKI_HOME_SLUG` |
| `catch-all.ts` / `markdown.ts` / `remark-links.ts` | Wiki URL matching and MDX leftover `/wiki/*.md` URLs |
