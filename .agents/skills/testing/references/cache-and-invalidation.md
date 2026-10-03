# Cache and invalidation: compare with a fresh build

Incremental paths fail by serving stale output. A test that checks "the cache hit" proves the cache is used, not that it is right. Prefer an equivalence oracle:

1. Build a temp project once.
2. Change one input the cache tracks: a layout, a component, a content file, the config.
3. Build again incrementally.
4. Build from scratch, with the cache disabled or forced, into a separate output directory.
5. Compare the normalized output: the same file set, the same content per file.

Pair it with a reuse assertion on an untouched input; a cache that always resets passes step 5 too. The same oracle fits a dev server: after a file change, the served page must equal what a fresh server renders.

If the oracle is slow, make it opt-in the way the project gates its other slow suites, rather than adding it to the default run.
