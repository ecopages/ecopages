---
'@ecopages/core': minor
'ecopages': minor
---

`ecopages start` runs the bundle that `ecopages build` wrote, whatever `distDir` the app sets, and the production server caches only content-hashed assets as `immutable`.

**Breaking:** `ecopages start` no longer assumes `dist`. It runs the only directory one level below the project root that holds `.server/manifest.json`, fails with the candidates listed when several exist, and fails with "run `ecopages build`" when none does. Pass `--dist-dir <dir>` to choose one. A server bundle without a manifest is no longer started. Rebuild with `ecopages build` after upgrading.

**Breaking:** Static files are no longer marked `immutable` because their name looks hashed. Only outputs that the build recorded as content-hashed are, which now includes Rolldown chunks whose hash contains `-`, while exported `.html` pages and unhashed `public` files are revalidated with an `ETag`. The runtime file server and the Node preview answer `If-None-Match` with `304`, gzip responses included. The `static` page-cache strategy is documented as `public, max-age=0, must-revalidate`.

**Breaking:** The page cache stays off in `ecopages dev` unless `cache.enabled: true` is set, as `CacheConfig.enabled` documents. It was on by default in watch mode. Set `cache.enabled: true` to keep the old behavior.

Dev vendor bundles are built in memory on the first request of each dev process and are no longer written under `dist/assets/vendors` or reused from an earlier process, so a transitive dependency update or a Core upgrade is picked up by restarting `ecopages dev`.
