# Custom element SSR script preload

Shared orchestration for `dependencies.scripts` entries marked `ssr: true`.

Lit and Ecopages JSX construct a {@link CustomElementScriptPreloader} with a stable `cacheScope` so imports are deduplicated across concurrent renders and dev invalidation can clear preload state without per-renderer registries.

Server evaluation uses `appConfig.runtime.appModuleLoader` via {@link createCustomElementServerModuleImporter}. Bun and other source-import hosts may preload directly from disk when `preferSourceImports` is enabled.
