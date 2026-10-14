---
'@ecopages/core': minor
---

Path invalidation now clears every query and development runtime variant for a pathname.

**Breaking:** Custom `CacheStore` implementations must return keys evicted by `set()` and keys removed by `invalidateByTags()` and `invalidateByPaths()`, instead of returning nothing or a count. Return every removed key, or an empty array when none were removed, so the page cache can keep its dependency tracking in sync.
