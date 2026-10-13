# Custom element SSR script preload

Shared orchestration for `dependencies.scripts` entries marked `ssr: true`.

Lit and Ecopages JSX construct a {@link CustomElementScriptPreloader} with a stable `cacheScope` so imports are deduplicated across concurrent renders and dev invalidation can clear preload state without per-renderer registries.

Every preloader takes one `importServerModule(scriptPath, registryKey)`, and every runtime, Bun included, evaluates scripts through it. A script is never imported from source, because a native import skips the server loaders for its CSS, MDX and asset imports.

- {@link createCustomElementSsrPipelineImporter} (Lit's render session) builds the script through the asset pipeline and imports a copy of the output per custom-element registry, written beside the pipeline file and removed once evaluated. Bun ignores a query-only URL change for every module, so a query cannot register the element on the next registry; the copy keeps the pipeline file's package scope and relative resolution. A script the pipeline cannot build, or whose output is its own source path, is reported as a preload failure.
- {@link createCustomElementServerModuleImporter} (the Lit static-render worker, which has no session) compiles the script through `appConfig.runtime.appModuleLoader` into a separate outdir per registry.
- {@link createSharedServerModuleImporter} (Ecopages JSX) compiles the script through the page server-module loader with external packages, because the dev asset pipeline still points at `.tsx` source and a browser bundle would register a second Radiant graph.

Lit only preloads lazy `ssr: true` script entries (`requireLazyScriptEntry`) so eager registrations are not evaluated in an isolated graph that would break `@lit-labs/ssr`. Ecopages JSX sets `collectForIntegration` so foreign integration scripts in shared dependency trees are not preloaded here; Lit and other hosts keep owning their registrations.
