---
'@ecopages/core': minor
'@ecopages/lit': patch
'@ecopages/ecopages-jsx': patch
---

An Integration's `ssrScriptPreload` is now the only statement of whether its renderer preloads `ssr: true` scripts. A renderer gets its `CustomElementScriptPreloader` from `createSsrScriptPreloader()` in its hook factory options, which throws when the Integration declares no `ssrScriptPreload`, and `getRenderer()` throws when an Integration declares one but its renderer builds no preloader. Before, the two could disagree and the scripts were silently left unevaluated.

Core also assigns the `ssr: true` scripts once per Page render, over the whole tree, instead of once per renderer hook. A script declared on both a Kita Component and an Ecopages JSX Component is now evaluated once, by Ecopages JSX, whichever Integration owns the Page. A Page owned by an Integration without a preloader, such as Kita, now also has the scripts it hands to Lit evaluated before it renders.

A Page lists the global scripts of every Integration it uses from each plugin's `getResolvedIntegrationDependencies()`; the owner's no longer come from the render session.

Breaking:

- `CustomElementScriptPreloaderOptions` loses `enabled`, and a renderer no longer constructs a preloader. Call `createSsrScriptPreloader({ integrationName, cacheScope, importServerModule, logLabel })` from the hook factory options and declare `ssrScriptPreload` on the plugin.
- `collectCustomElementSsrPreloadScripts` is replaced by `assignSsrPreloadScripts`, which returns every Integration's scripts as a `SsrScriptAssignment` map. `CustomElementScriptPreloader` gains `preloadAssigned()` and `preloadScripts()`.
- `IntegrationRenderer.resolveRouteDependencies` returns `resolvedDependencies` only; `integrationDependencies` is gone, and `createRenderSession()` takes no argument.
- A renderer outside a configured app, such as a test that builds a Lit or Ecopages JSX renderer by hand, needs the plugin in `appConfig.integrations`.
