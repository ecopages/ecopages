---
title: Agent markdown access
summary: reproducible markdown retrieval and search contract
sources: []
updated: 2026-09-13
---

# Agent Markdown Access

An agent should retrieve a wiki page as Markdown, not scrape its HTML. The response is the ingested copy, so its relative wiki links have already been rewritten to site URLs.

## Retrieval contract

For a page at `/wiki/<category>/<page>`, use any of these reproducible forms:

```bash
curl -sH 'Accept: text/markdown' http://localhost:3333/wiki/app/demo
curl -s http://localhost:3333/wiki/app/demo.md
curl -s 'http://localhost:3333/wiki/app/demo?format=md'
curl -s http://localhost:3333/api/wiki/app/demo
```

The `.md` suffix always requests Markdown. The Accept form wins only when `text/markdown` is at least as preferred as `text/html`; wildcard Accept values do not select Markdown. `HEAD` returns the same content type without a body.

`GET /api/wiki/<category>/<page>` is the server API for the same ingested body. It is available in `dev` and `start`, not in static `preview`.

Use the server API to search before fetching individual pages:

```bash
curl -s 'http://localhost:3333/api/search?q=wiki&page=1&limit=10'
```

Search matches every distinct query token as a whole token, ranks title matches above body matches, and limits a page to 50 results. It is intentionally a small in-memory search engine, not fuzzy or substring search.

## Static-preview limitation

`pnpm preview` serves static files only. It supports the `.md` form and `/search-index.json`, but not `/api/search`, `/api/wiki/...`, `?format=md`, or Accept negotiation. Use `pnpm dev` or `pnpm start` to exercise those server features.

See [LLM Wiki Site](../app/llm-wiki-site.md) for the site boundary and [maintain the wiki](../recipe/maintain-wiki.md) for content changes.
