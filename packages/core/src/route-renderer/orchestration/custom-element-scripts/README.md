# Custom element SSR script preload

Shared orchestration for `dependencies.scripts` entries marked `ssr: true`.

Lit and Ecopages JSX construct a {@link CustomElementScriptPreloader} with a stable `cacheScope` so imports are deduplicated across concurrent renders and dev invalidation can clear preload state without per-renderer registries.

Server evaluation uses `appConfig.runtime.appModuleLoader` via {@link createCustomElementServerModuleImporter} when no {@link createCustomElementSsrPreloadEntrypointResolver} is configured. Lit and Ecopages JSX pass a resolver so Node preloads through the asset pipeline and shares one module graph with the renderer. Bun and other source-import hosts may preload directly from disk when `preferSourceImports` is enabled.

Lit only preloads lazy `ssr: true` script entries (`requireLazyScriptEntry`) so eager registrations are not evaluated in an isolated graph that would break `@lit-labs/ssr`.
