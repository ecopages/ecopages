# Custom element SSR script preload

Shared orchestration for `dependencies.scripts` entries marked `ssr: true`.

Lit and Ecopages JSX construct a {@link CustomElementScriptPreloader} with a stable `cacheScope` so imports are deduplicated across concurrent renders and dev invalidation can clear preload state without per-renderer registries.

Server evaluation uses `appConfig.runtime.appModuleLoader` via {@link createCustomElementServerModuleImporter} when no {@link createCustomElementSsrPreloadEntrypointResolver} is configured. Lit passes a resolver so Node preloads through the asset pipeline and Bun can import source. The resolver skips {@link importServerModule}; Lit's static-render worker therefore omits it and uses the app module loader so `@lit-labs/ssr` sees registered custom elements. Ecopages JSX does not pass a resolver. On Bun, `preferSourceImports` imports the script source directly. On Node it imports through the page server-module loader with external packages, because the dev asset pipeline still points at `.tsx` source and a browser bundle would register a second Radiant graph.

Lit only preloads lazy `ssr: true` script entries (`requireLazyScriptEntry`) so eager registrations are not evaluated in an isolated graph that would break `@lit-labs/ssr`. Ecopages JSX sets `collectForIntegration` so foreign integration scripts in shared dependency trees are not preloaded here; Lit and other hosts keep owning their registrations.
