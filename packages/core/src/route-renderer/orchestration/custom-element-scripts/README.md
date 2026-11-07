# Custom element SSR script preload

**Layer:** Rendering.

Shared orchestration for `dependencies.scripts` entries marked `ssr: true`.

Lit and Ecopages JSX construct a {@link CustomElementScriptPreloader} with a stable `cacheScope` inside the app's `AppRuntime`. The scope deduplicates imports across concurrent renders for that app, and dev invalidation clears only that app's preload state. Two apps may use the same integration scope name without sharing preload history.

Every preloader takes one `importServerModule(scriptPath, registryKey)`, and every runtime, Bun included, evaluates scripts through it. A script is never imported from source, because a native import skips the server loaders for its CSS, MDX and asset imports.

- {@link createCustomElementServerModuleImporter} (Lit, in serving, on the static-export main thread and in the static-render worker) compiles the script through `requireAppRuntime(appConfig).moduleLoader` into a separate outdir per registry under the work directory. No preload builds through the browser asset pipeline, so a production build emits no browser bundle for a preloaded script.
- {@link createSharedServerModuleImporter} (Ecopages JSX) compiles the script through the page server-module loader with external packages, because the dev asset pipeline still points at `.tsx` source and a browser bundle would register a second Radiant graph.

Lit only preloads lazy `ssr: true` script entries (`requireLazyScriptEntry`) so eager registrations are not evaluated in an isolated graph that would break `@lit-labs/ssr`. Ecopages JSX sets `collectForIntegration` so foreign integration scripts in shared dependency trees are not preloaded here; Lit and other hosts keep owning their registrations.
