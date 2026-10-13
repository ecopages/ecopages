---
'@ecopages/core': minor
'ecopages': minor
---

`ecopages start` runs the bundle that `ecopages build` wrote, whatever `distDir` the app sets, and the production server caches only content-hashed assets as `immutable`.

**Breaking:** `ecopages start` no longer assumes `dist`. It runs the only directory one level below the project root that holds `.server/manifest.json` (dot-prefixed directories count; symlinked and nested outputs such as `out/web` do not), fails with the candidates listed when several exist, and fails with "run `ecopages build`" when none does. Pass `--dist-dir <dir>` to choose one, which an app that builds several outputs, such as `dist-<scope>`, has to do. A server bundle without a manifest is no longer started, and `resolveProductionServerEntry`, `assertProductionConfigIdentity` and `resolveEmittedEcoConfigPath` from `@ecopages/core/config` now require the `distDir` instead of defaulting to `dist`. Rebuild with `ecopages build` after upgrading.

**Breaking:** Static files are no longer marked `immutable` because their name looks hashed. Only outputs that the build recorded as content-hashed are, which now includes Rolldown chunks whose hash contains `-`; exported `.html` pages and every other file, such as `public` files, are revalidated with an `ETag`. `isContentHashedAssetFilename` is removed from `@ecopages/core/assets/hashed-browser-asset`; there is no filename-based replacement, because a name cannot tell a content hash from a word.

**Breaking:** The runtime file server and the Node preview share one response policy. Both answer `If-None-Match` with `304`, gzip responses included, and both send a gzip variant only to a client whose `Accept-Encoding` allows it, with `Vary: Accept-Encoding`; the runtime server used to send it unconditionally. In `ecopages dev`, static non-HTML files are sent with `Cache-Control: no-cache`.

**Breaking:** The page cache stays off in `ecopages dev` unless `cache.enabled: true` is set, as `CacheConfig.enabled` documents. It was on by default in watch mode. Set `cache.enabled: true` to keep the old behavior.

Dev vendor bundles are built in memory on the first request of each dev process and are no longer written under `dist/assets/vendors` or reused from an earlier process, so a transitive dependency update or a Core upgrade is picked up by restarting `ecopages dev`. The caching guide now lists the `static` page-cache strategy as `public, max-age=0, must-revalidate`, which is what it always sent.
