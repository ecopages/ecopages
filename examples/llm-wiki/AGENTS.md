# Agent instructions

This is an LLM Wiki. Follow [SCHEMA.md](./SCHEMA.md) for ingest, query, and lint.

- `sources/` is immutable. Never edit a source after adding it.
- `wiki/` is the agent-written layer. You own it; the human reads it.
- `src/content/wiki` is generated. Never edit it.
- File useful answers back into `wiki/` and update `index.md` + `log.md`.
- The browsable site lives in [`app/`](./app). Prefer markdown URLs when reading pages (`Accept: text/markdown` or `/wiki/<slug>.md`).
