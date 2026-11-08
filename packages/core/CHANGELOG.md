# Changelog

## 0.7.0

### Minor Changes

- [#1133](https://github.com/ecopages/ecopages/pull/1133) [`014087b`](https://github.com/ecopages/ecopages/commit/014087bb4149841fbdde98d0e0751aef2680040b) Thanks [@andeeplus](https://github.com/andeeplus)! - `*.module.<ext>` is a CSS Module only when the stylesheet capability that declares `<ext>` sets `cssModules`, the same rule the generated declarations already followed. With `{ extensions: ['*.css'], cssModules: true }` and `{ extensions: ['*.scss'] }`, `card.module.scss` is a plain stylesheet typed as a `string`; before, it was classified as a CSS Module and the build failed with "returned no exports". `.module.css` stays a CSS Module.

    `ecopages build` now fails when an app module binds a CSS Module that no Eco declaration reaches, such as a module loaded only through `import()` or `export *`: its CSS never reached a Page and nothing said so. The error names both files; `ecopages dev` warns once instead. Import the module, or the CSS Module, from an `eco.page()`, `eco.layout()`, `eco.html()` or `eco.component()` module.

- [#1124](https://github.com/ecopages/ecopages/pull/1124) [`57c8af2`](https://github.com/ecopages/ecopages/commit/57c8af26ec775fa886c8bc3553a7741ce27d4d98) Thanks [@andeeplus](https://github.com/andeeplus)! - Import the classes of a CSS Module by name: `import { primary } from './button.module.css'`. Each class whose name is a valid JavaScript identifier is a named export, the same in server builds, browser bundles and development; other names, such as `is-active`, stay on the default export, and no name is renamed. `ecopages types` now writes one declaration per CSS Module into `node_modules/@types/ecopages-css-modules`, with the default map and the named exports keyed by the class names, and development rewrites a declaration when its CSS Module changes. TypeScript finds the declarations through `rootDirs` (and an extra `paths` candidate for an alias such as `@/*`) that list that folder. The official templates include them; for an existing app add `"rootDirs": ["./src", "./node_modules/@types/ecopages-css-modules"]` to `tsconfig.json`. `ecopages types` and the dev server warn, printing the lines, when an app with CSS Modules lacks them. Then an unknown class fails type checking.

- [#1117](https://github.com/ecopages/ecopages/pull/1117) [`423a59b`](https://github.com/ecopages/ecopages/commit/423a59bbb66dc8c5aba5f33acdc62430d88df189) Thanks [@andeeplus](https://github.com/andeeplus)! - Support CSS Modules through the stylesheet Processor. `import styles from './card.module.css'` now gives the component the map of its class names, the same in server builds, browser bundles and development, and the scoped CSS reaches the Page as a stylesheet of the declaration that imports it. A stylesheet Processor opts in with `cssModules: true` on its `stylesheet` capability and returns `exports` from `transformStylesheet`. Without one, importing a CSS Module fails the build and names the importing file and `@ecopages/lightningcss-processor`. Core types the default export in its ambient declarations; CSS Modules from packages are not supported. In development, an edit that keeps the class map only refreshes the stylesheet, and an edit that changes it also updates the modules that import it.

- [#1148](https://github.com/ecopages/ecopages/pull/1148) [`5afc28d`](https://github.com/ecopages/ecopages/commit/5afc28df3bb7f45f15950e53daf0f969229b0ab4) Thanks [@andeeplus](https://github.com/andeeplus)! - Keep `ecopages dev` usable while a script is broken, as it already is for a stylesheet. A Page request renders instead of answering 500 when a content, file, node-module or grouped script fails to bundle, and serves that script's last good bundle, or renders without it when it never built since the dev server started. The dev transform server keeps answering with the last compiled module of any browser module that fails to compile, so the page keeps its behaviour. An `ssr: true` script that fails to evaluate on the server leaves its element without server rendering. Each failure shows in the browser overlay with the script's path, also on a page that loads later, and the next good save clears it. `ecopages build` and static generation still fail on a broken script, and now also fail when an `ssr: true` script fails to evaluate on the server, which used to log a warning and ship the element without server rendering; this can fail a build that passed before. `ecopages start` only logs the warning, as before. A Page module that fails to build on the server still answers 500.

- [#1066](https://github.com/ecopages/ecopages/pull/1066) [`43c3a42`](https://github.com/ecopages/ecopages/commit/43c3a42dad0f1d6899f4e87fc54f3cd6694a6cc7) Thanks [@andeeplus](https://github.com/andeeplus)! - Resolve each bare import in `ecopages dev` from the module that imports it, as Node and the production build do. A dependency that only an integration package declares, such as `@lit-labs/ssr-client` for `@ecopages/lit`, now resolves under pnpm's strict layout, so Lit pages hydrate in development with a fresh cache. Two installed versions of one package get two vendor URLs; importers that resolve a package to the same file still share one URL. A package install during the session now moves each importer to the file it reaches. When one package resolves to more than one installed copy, such as a second React from a pnpm peer variant, `ecopages dev` logs a warning naming each copy and the directories that import it.

    **Breaking:** `DevTransformBundleContributor.getVendorEntries()` returns `{ resolveFrom, specifiers }` (`DevTransformVendorEntries`) instead of a list of specifiers. `resolveFrom` is a directory inside the contributing package, such as `import.meta.dirname` of the contributor's module, and the specifiers resolve from it. To migrate, return `{ resolveFrom: import.meta.dirname, specifiers: [...] }`.

- [#1086](https://github.com/ecopages/ecopages/pull/1086) [`f3fdb55`](https://github.com/ecopages/ecopages/commit/f3fdb55f7b061b3624aa66778e7b2d2042faab65) Thanks [@andeeplus](https://github.com/andeeplus)! - The app runtime now fixes when activation resolves Integration global scripts: `AppRuntime.globalScriptResolution` is `'browser-build'` for a production export (`ecopages build`, or `ecopages preview` without `--serve-only`) and the Lit static-render worker, and `'activation'` otherwise. No activation call chooses it any more, so whichever caller activates first, a production build bundles no global script on its own into `dist/client`. A process that builds without those commands, such as a test, passes `globalScriptResolution: 'browser-build'` to `loadEcoPagesConfig()` or `finalizeEcoPagesConfig()`; static generation, `emitProductionServerModules()` and the public `resolveIntegrationDependencies()` from `@ecopages/core/build` now throw on any other runtime. After `resolveIntegrationDependencies()` has run, a later activation on the same runtime, such as `app.fetch()` after a build, resolves global scripts at activation again.

    Each `IntegrationPlugin.setup()` now empties the resolved global-script list in place, so a second build in the same process does not see the previous one's assets. `resolvedIntegrationDependencies` is `protected readonly`: a subclass that reassigned it updates the array in place or calls `refreshResolvedIntegrationDependencies()` instead.

- [#1073](https://github.com/ecopages/ecopages/pull/1073) [`58f59ab`](https://github.com/ecopages/ecopages/commit/58f59ab2b4caa8388439aba2a433ca7a80f50d10) Thanks [@andeeplus](https://github.com/andeeplus)! - `IntegrationPlugin.setup()` no longer resolves an Integration's global scripts (`integrationDependencies`). Core's activation resolves them right after a successful `setup()` in dev and `ecopages start`. `ecopages build` and the Lit static-render worker resolve them once their browser build is known, through the new `resolveIntegrationDependencies()` export of `@ecopages/core/build`. A third-party Integration must not read `getResolvedIntegrationDependencies()` inside `setup()`; the list fills after it.

    The resolved list is now one array for the Integration's lifetime, updated in place, so a renderer that holds it sees new entries after a teardown and a later setup. `AppRuntime.integrationDependenciesDeferred` is removed.

- [#1096](https://github.com/ecopages/ecopages/pull/1096) [`b76f196`](https://github.com/ecopages/ecopages/commit/b76f196a37e8a04c656cd56b31e1c7a4c5aa970a) Thanks [@andeeplus](https://github.com/andeeplus)! - Lit now server-renders a custom element whose `ssr: true` script is not lazy, as the docs describe: `{ src: './counter.script.ts', ssr: true }` preloads the script on the server before render, so the element ships with its declarative shadow root on a Lit Page and inside any other Integration. Before, only lazy `ssr: true` scripts were preloaded and the element reached the HTML empty.

    Breaking: `CustomElementScriptPreloader` from `@ecopages/core/integration` no longer takes `requireLazyScriptEntry`, and `collectCustomElementSsrPreloadScripts` drops that parameter, so `collectForIntegration` is now its third argument. Remove the option; every `ssr: true` entry is preloaded, eager or lazy.

- [#1123](https://github.com/ecopages/ecopages/pull/1123) [`efa15e8`](https://github.com/ecopages/ecopages/commit/efa15e8f5aab9479c7aa86dd3118b4b6ee43eb8b) Thanks [@andeeplus](https://github.com/andeeplus)! - Server-render Lit elements in markup another Integration produced. A Lit element whose `ssr: true` script a Kita Component declares now gets its declarative shadow root on a Kita Page and inside a Foreign Subtree spliced into a Lit Page, and Lit's hydration support loads before the element script. Pages with no `ssr: true` script assigned to Lit render as before. Integrations can opt in with the new `renderCustomElements` renderer hook.

- [#1068](https://github.com/ecopages/ecopages/pull/1068) [`f74dd62`](https://github.com/ecopages/ecopages/commit/f74dd62fb0a714ddf398b9683e4113b6466e3e9d) Thanks [@andeeplus](https://github.com/andeeplus)! - A production build now writes only files that a Page loads to `dist/client/assets`. These files, which no Page referenced, are no longer written:

    - a browser bundle, with its own copy of Lit, for each Lit `ssr: true` script. Lit now preloads those scripts with the server module loader during static export too, as it already did when serving.
    - a standalone bundle of each Integration's global scripts, such as Lit hydration support, which `setup()` built before the app-wide browser build existed.
    - the bundle file of an inline script, such as the global injector bootstrap, whose code the Page already embeds.
    - one extra entry per Integration for a script several Integrations declare.
    - the PostCSS processor's copy of every stylesheet in `src`. The stylesheet pipeline still writes each stylesheet a Page links.

    `createCustomElementSsrPipelineImporter` is removed from `@ecopages/core/integration`. Use `createCustomElementServerModuleImporter` instead.

- [#1061](https://github.com/ecopages/ecopages/pull/1061) [`2608e0a`](https://github.com/ecopages/ecopages/commit/2608e0ad83cb684711579703983306da779cf6cb) Thanks [@andeeplus](https://github.com/andeeplus)! - Each `EcoBuildPlugin` handler now runs as its own Rolldown plugin with a native filter, so Rolldown does the matching, the first-wins resolve and load, the transform source-map chaining and the plugin names in errors.

    Breaking changes to the build plugin contract:

    - Namespaces are removed: `onResolve` and `onLoad` take no `namespace` option, their callbacks get no `namespace` argument, and an `onResolve` result has no `namespace` field. Return a path starting with `\0` for a virtual module, or use `build.module(specifier, callback)`, which now resolves to `\0<specifier>`.
    - The `kind` argument of `onResolve` and the `EcoBuildImportKind` type are removed.
    - `parseCollectionSpecifier()` no longer accepts the namespace-split `content/<collection>` form; pass the full `ecopages:content/<collection>` specifier.
    - The `object` loader and the `exports` field of an `onLoad` result are removed. Return `{ contents: \`export default ${JSON.stringify(value)};\`, loader: 'js' }` instead.
    - `BuildSuccess.loadedInputs` and `loadedInputsByModule` are removed. A file a plugin read joins `dependencyGraph.entrypoints` when the plugin declares it with the new `build.addWatchFile(path)`, called inside an `onLoad` or `transform` callback.

    `onResolve`, `onLoad` and `transform` accept an optional native `exclude` pattern, and `build.resolve(specifier, importer)` resolves a specifier the way the build does from inside an `onLoad` or `transform` callback. A `transform` filter is tested against the module id with its query and hash stripped, so `/\.ts$/` matches `page.ts?v=1`, and a module id with `:` in its query is now transformed. The React client-graph boundary registers one handler per build, skips `node_modules` natively, parses each module once, declares the files it inlines so editing one rebuilds the module in development, and prunes a shared module the same way whichever importer loads first.

- [#1137](https://github.com/ecopages/ecopages/pull/1137) [`e7a129b`](https://github.com/ecopages/ecopages/commit/e7a129ba19003015bad6e64d40b191a46276273c) Thanks [@andeeplus](https://github.com/andeeplus)! - Require Node.js `^24.22.0 || >=26.0.0`, declared in `engines.node`. Node 24 releases before 24.22 and Node 25 are no longer supported, because older Node 24 releases report file deletions unreliably in the Linux recursive watcher. Upgrade Node.js before updating.

- [#1037](https://github.com/ecopages/ecopages/pull/1037) [`719419c`](https://github.com/ecopages/ecopages/commit/719419c1229af6ace2f8d747c25fa5be57d5c9c9) Thanks [@andeeplus](https://github.com/andeeplus)! - `ecopages build` writes its emitted browser assets to one file, `dist/server/processed-assets.json`: each processed stylesheet and script file, and each script the app-wide browser build bundled, recorded once by dependency key with paths relative to the app root, plus the HTML module-script URLs. `dist/server/browser-client-manifest.json` is gone, and a script many routes share is recorded once instead of once per route. Any request whose scripts the build recorded links them, including params the build did not plan. Run `ecopages build` again before `ecopages start` with a build from an earlier version.

    React MDX scripts marked `lazy` and `ssr: true` are now bundled in the app-wide build, so they share chunks with the other component scripts.

    Breaking for Integration authors: a `collectPageBrowserGraphContribution` hook must not process component dependencies, because the production prebuild calls it before the app-wide build exists. Return the components in `components` and any other scripts in `bundledScripts`; core processes both when it resolves the Page Browser Graph and plans their scripts for the app-wide build. `prebuildProductionPageBrowserGraphsFromManifest` is renamed `restoreProductionPageBrowserGraphs`.

- [#1090](https://github.com/ecopages/ecopages/pull/1090) [`e0e8cb6`](https://github.com/ecopages/ecopages/commit/e0e8cb646a282055bad038c2fed98ede3f0d478c) Thanks [@andeeplus](https://github.com/andeeplus)! - Core names the stylesheet extensions once, and an app allows one stylesheet Processor. A file is a stylesheet when it is `.css` or has an extension the registered stylesheet Processor declares in its `stylesheet` capability, and `.module.<ext>` for those extensions is a CSS Module. Discovery, the stylesheet module plugin, the dev transform server and the stylesheet pipeline all follow that rule, so `import './card.scss'` is now discovered and kept out of every build, and `import styles from './card.scss'` compiled, when a Processor declares `*.scss`, and both are left alone when none does. Core no longer treats `.scss`, `.sass` and `.less` as stylesheets by themselves.

    Breaking: config finalization now fails when two Processors declare a `stylesheet` capability, naming both, and `transformStylesheet` no longer runs through a chain of Processors in registration order. Register one stylesheet Processor and combine any further steps inside it.

    A stylesheet `url()` may now copy `.apng`, `.jxl`, `.tif`, `.mov` and `.m4a` files, and `url(var(--x))` is skipped without a warning that shows a garbled path.

- [#1130](https://github.com/ecopages/ecopages/pull/1130) [`0a0e9cd`](https://github.com/ecopages/ecopages/commit/0a0e9cdeff94077bf63d20678db3dd54c195b221) Thanks [@andeeplus](https://github.com/andeeplus)! - Support CSS Modules from packages. `import styles from 'ui-kit/button.module.css'` gives the importer the class map and delivers the scoped CSS to the Page, in server builds, browser bundles and development, when the stylesheet Processor declares `cssModules`. The file is scoped by that Processor and by nothing else, and the files its `url()` references name are copied as for any package stylesheet. Without such a Processor the build still fails and names the importing file, the specifier and `@ecopages/lightningcss-processor`. A package module that imports its own CSS Module is followed from the static imports of a declaration, and the build fails, naming both files, when no declaration reaches it. Core exports `toPackageScopeFile` from `@ecopages/core/processor`, the one rule that names the file a package stylesheet is scoped by: the package name and the path inside it, so a Processor's class names do not depend on the folder or the package-manager layout.

- [#1062](https://github.com/ecopages/ecopages/pull/1062) [`3573a51`](https://github.com/ecopages/ecopages/commit/3573a51150f36202228b6982bc0506f2b0168858) Thanks [@andeeplus](https://github.com/andeeplus)! - Link package stylesheets on the Page. A side-effect import such as `import 'react-day-picker/style.css'`, in a declaration or in a plain component it imports, no longer fails the build: it is discovered like local CSS, attached to the nearest declaration, linked once in development and production, and recorded in the asset ledger so `ecopages start` serves it. A specifier ending in `.css` resolves through the package's `exports` with the `style` condition first; any other specifier, such as `import 'swiper/css'`, counts only when the package resolves it to a `.css` file.

    Fonts and images the stylesheet references with a relative `url()` are emitted under content hashes and the references rewritten. CSS Processors such as PostCSS and Tailwind do not run on package stylesheets. Relative and package `@import`s are inlined, wrapped in `@layer`, `@supports` and `@media` blocks for their conditions. The build fails when a relative `url()` or `@import` names a missing file or a file outside the package. CSS Modules still fail the build.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`631d8de`](https://github.com/ecopages/ecopages/commit/631d8de32a3f46ea4d36a87c1015295895c53baf) Thanks [@andeeplus](https://github.com/andeeplus)! - `eco.page` with explicit `Props` and `Element` type arguments no longer silently drops `requires` narrowing. A call that writes two type arguments together with `requires` is now a type error; write the key union as the third type argument (`eco.page<Props, Element, 'session'>`) or omit the type arguments.

- [#1042](https://github.com/ecopages/ecopages/pull/1042) [`b8d7d41`](https://github.com/ecopages/ecopages/commit/b8d7d418befab0cba03dffc34cb4f2b815bc0803) Thanks [@andeeplus](https://github.com/andeeplus)! - Deliver the CSS of plain function components. Discovery now follows a declaration's static imports through plain local modules, stopping at Eco modules, packages and `.server` modules, and hands their side-effect CSS to the nearest `eco.page()`, `eco.layout()`, `eco.html()` or `eco.component()` that imports them. The stylesheet is linked once, after the CSS of every declaration importing it, so CSS under a persisted layout stays with it across navigation. Eco Components a plain module imports become Components of that declaration, and editing a plain module's imports in development refreshes the Page's stylesheets.

    The build removes those imports from every plain module, so development, production, server and browser builds treat them alike: no more dropped stylesheets on the server, CSS shipped as an unused string with the PostCSS Processor, or a production browser build failing without one.

    Breaking: these CSS imports now fail the build in development and in `ecopages build`, naming the file and the import:

    - a side-effect CSS import in a plain module inside the app that no declaration reaches (for example one imported only through `export *`, a namespace import, or a client script);
    - a CSS Module, in a module an Integration owns or discovery reaches.

    Rendering a plain component owned by another Integration that compiles JSX differently (a plain React component in a Kita Page) also fails the build, naming the component and both Integrations; wrap it in `eco.component()` to render it as a Foreign Child.

    `EcoBuildPluginBuilder` gains `onEnd(callback)`, which runs once every module of a build is transformed; a custom builder implementation must provide it.

- [#1047](https://github.com/ecopages/ecopages/pull/1047) [`f6deeef`](https://github.com/ecopages/ecopages/commit/f6deeef6871846009748ad85e5ed95fc0f71890a) Thanks [@andeeplus](https://github.com/andeeplus)! - Accept plain layout functions. `eco.page({ layout })` takes an `eco.layout()` result or a plain function typed with `LayoutProps`; its CSS and component imports are discovered, so `eco.layout()` is only needed for browser `scripts`, `modules`, stylesheet attributes or an `integration` override. `@ecopages/react-router` persists layouts by function reference: a layout module has one URL in development and production, so pages that import a layout share one function and React keeps its state. React HMR refreshes a layout through the pages that import it instead of matching component identity.

    Breaking:

    - `layout` accepts only layout-shaped components. A component whose props lack `children`, such as an `eco.component()` that takes other props, is a type error; use `eco.layout()` or a function typed with `LayoutProps`. `EcoPageLayoutEntry` is now the normalized entry stored on page config, and `EcoPageLayoutEntrySpec` is the `{ component, props }` entry written in `eco.page()`. `eco.layout<E, P>()` takes the layout's props as an optional second type argument; extra props must be optional to be passed as `layout`.
    - A layout that renders without its `children` fails `ecopages build` with `Layout <name> (<file>) did not render its children`, in every Integration. A development request logs it as a warning; a production request returns the layout's HTML unchanged.
    - `@ecopages/react-router` no longer exports `clearLayoutCache`. With `persistLayouts: false`, layouts now remount on every page change.
    - Every Lit component, not only layouts: children passed to a component whose template has no children slot marker are now dropped instead of appended after its markup. Only a document shell (a template with `</html>`) without a marker still gets them before `</body>`.

- [#1044](https://github.com/ecopages/ecopages/pull/1044) [`98115a8`](https://github.com/ecopages/ecopages/commit/98115a8c7cabd1c494f27c712a9a11de23a9cd7e) Thanks [@andeeplus](https://github.com/andeeplus)! - Remove `EcoBuildPlugin.bundleGroupKey`. Browser entries now share a build whenever `define`, `minify`, `treeshaking` and plugin exclusions match, whatever plugins they declare, so the key no longer changes anything; delete it from your plugins. Each plugin of a shared build applies to every module its filters match, so a module compiles the same way whichever entry imports it.

    In a production build shared with other Integrations, React compiles a file another JSX Integration owns with React's JSX runtime only when React's islands or Pages import it. A file only another Integration's browser entries import keeps its own runtime, and a file both import fails the build with the file and both Integrations named.

- [#1067](https://github.com/ecopages/ecopages/pull/1067) [`3ca010e`](https://github.com/ecopages/ecopages/commit/3ca010e0e853dbf620003c74d3f539d37389f4cd) Thanks [@andeeplus](https://github.com/andeeplus)! - A build copied or moved to another folder now starts and serves every page. Server modules and `processed-assets.json` hold no path of the machine that built them: component identity files, discovered stylesheets, imported views and content entries are written relative to the app root, and a package stylesheet by its package name, version and subpath, such as `some-lib@1.2.0/css/style.css`, resolved at load from the folder of the module that imports it, so another store layout or a linked workspace package's own dependency keeps working too. Node-module scripts are keyed by package path the same way. React page, island and lazy entries key their generated text with the files they import written relative to the app root, and no build plugin `cacheKey` holds an absolute path.

    `processed-assets.json` moves to version 4; run `ecopages build` again before `ecopages start`. For Integration and plugin authors: `identity.file` is root-relative; a package stylesheet's `fromPackage` is its package path (`some-lib@1.2.0/css/style.css`) instead of `true`; `collectComponentConfigFilePaths` now requires its options, with `rootDir`; `createViewReference` keeps a relative path and resolves it against the app root at render instead of the working directory; `@ecopages/core/build` exports `toRootRelativePath`; and a plugin `cacheKey` must not contain an absolute path.

    Under Node, `ecopages start` of a workspace app whose PostCSS processor is linked from source no longer fails to load `postcss-import`.

- [#1120](https://github.com/ecopages/ecopages/pull/1120) [`3e17c88`](https://github.com/ecopages/ecopages/commit/3e17c88cea628005d1db0e69f5d3545db983962e) Thanks [@andeeplus](https://github.com/andeeplus)! - An Integration's `ssrScriptPreload` is now the only statement of whether its renderer preloads `ssr: true` scripts. A renderer gets its `CustomElementScriptPreloader` from `createSsrScriptPreloader()` in its hook factory options, which throws when the Integration declares no `ssrScriptPreload`, and `getRenderer()` throws when an Integration declares one but its renderer builds no preloader. Before, the two could disagree and the scripts were silently left unevaluated.

    Core also assigns the `ssr: true` scripts once per Page render, over the whole tree, instead of once per renderer hook. A script declared on both a Kita Component and an Ecopages JSX Component is now evaluated once, by Ecopages JSX, whichever Integration owns the Page. A Page owned by an Integration without a preloader, such as Kita, now also has the scripts it hands to Lit evaluated before it renders.

    A Page lists the global scripts of every Integration it uses from each plugin's `getResolvedIntegrationDependencies()`; the owner's no longer come from the render session.

    Breaking:

    - `CustomElementScriptPreloaderOptions` loses `enabled`, and a renderer no longer constructs a preloader. Call `createSsrScriptPreloader({ integrationName, cacheScope, importServerModule, logLabel })` from the hook factory options and declare `ssrScriptPreload` on the plugin.
    - `collectCustomElementSsrPreloadScripts` is replaced by `assignSsrPreloadScripts`, which returns every Integration's scripts as a `SsrScriptAssignment` map. `CustomElementScriptPreloader` gains `preloadAssigned()` and `preloadScripts()`.
    - `IntegrationRenderer.resolveRouteDependencies` returns `resolvedDependencies` only; `integrationDependencies` is gone, and `createRenderSession()` takes no argument.
    - A renderer outside a configured app, such as a test that builds a Lit or Ecopages JSX renderer by hand, needs the plugin in `appConfig.integrations`.

- [#1063](https://github.com/ecopages/ecopages/pull/1063) [`a13ca81`](https://github.com/ecopages/ecopages/commit/a13ca81cfa488ab9fe65830ccc2329cbb6a0c8a9) Thanks [@andeeplus](https://github.com/andeeplus)! - React, React DOM, the React router and `@ecopages/react/layout-compose` now load as ordinary packages of the browser graph. Production bundles them into the app-wide build, so they are content-hashed chunks served `immutable` instead of fixed `/assets/vendors/` URLs revalidated on every load, and a page loads one copy of React whether it hydrates a Page, islands or both. `ecopages dev` serves each from its one vendor URL, and imports of a CommonJS vendor such as React get the interop the production build applies: named imports read `module.exports`, `default` is `module.exports.default` when the module sets `__esModule` and `module.exports` otherwise, and `import()` resolves to the same namespace. Browser builds now define `process.env.NODE_ENV` from the current Node environment.

    Breaking changes:

    - `ReactRouterAdapter.bundle` is replaced by `importPath`, the package of the router's browser entry: `{ name, importPath: '@my/router/browser', components, getRouterProps }`. `ecoRouter()` already returns the new shape.
    - `IntegrationPluginConfig.browserRuntimeManifest`, `AppBuildManifest.browserRuntimeManifest`, the browser runtime manifest and plugin exports of `@ecopages/core/build` (`createBrowserRuntimeManifest`, `createBrowserRuntimePlugin`, `getBrowserRuntimeSpecifierMap` and related types), and `buildBrowserRuntimeAssetUrl`, `createBrowserRuntimeScriptAsset` and `createBrowserRuntimeModuleAsset` from `@ecopages/core/integration` are removed. A browser package an Integration's generated scripts import needs no declaration; import it by name.
    - The `runtime` asset package role and `DevTransformBundleContributor.getRuntimeSpecifierMap` are removed. A contributor can declare the packages its generated modules import with `getVendorEntries`.
    - `IHmrManager` gains a required `rewriteModuleImports(code, importerPath)`, which rewrites the imports of an unbundled module script the way the dev transform rewrites a module. A custom HMR manager must implement it.
    - `@ecopages/react/runtime/use-sync-external-store-with-selector` is removed; `use-sync-external-store/shim/with-selector` resolves as a normal package.

- [#1060](https://github.com/ecopages/ecopages/pull/1060) [`c605ac6`](https://github.com/ecopages/ecopages/commit/c605ac69ac0c5159472c375289854800037462aa) Thanks [@andeeplus](https://github.com/andeeplus)! - Pages declare their data only through the `staticPaths`, `staticProps` and `metadata` options of `eco.page({ ... })`. Core no longer reads the module-level `getStaticPaths`, `getStaticProps` and `getMetadata` exports, and `eco.staticPaths()`, `eco.staticProps()` and `eco.metadata()` are removed. A page module that still exports one of them fails in `ecopages dev` and `ecopages build` with an error that names the file and points to the `migrate-to-eco-page` codemod, which now also migrates `export function` declarations, export lists, the removed wrappers and pages that already call `eco.page()`. MDX pages keep their `getMetadata` export, since they cannot call `eco.page()`. The React client-graph boundary no longer special-cases the legacy exports.

- [#1045](https://github.com/ecopages/ecopages/pull/1045) [`bbb8bdd`](https://github.com/ecopages/ecopages/commit/bbb8bdd3a740df1fe4fd3af6331ecf482f6f5ab6) Thanks [@andeeplus](https://github.com/andeeplus)! - `eco.config.ts` accepts a `headers` option: a list of `{ source, headers }` rules that add response headers to every response Ecopages serves under `dev`, `start` and `preview`, including rendered pages and files from `public/` and `dist/client`. This makes cross-origin isolation (`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`, needed for `SharedArrayBuffer` and threaded WebAssembly) and scoped CORS configurable. A configured header replaces a same-named framework header, and an invalid `source` fails when the config loads.

- [#1110](https://github.com/ecopages/ecopages/pull/1110) [`a8cb035`](https://github.com/ecopages/ecopages/commit/a8cb0355a62aa5d7e46bcaaef4d33055355ef1d6) Thanks [@andeeplus](https://github.com/andeeplus)! - A React router navigation into a Page with a Lit Component now hydrates the element's server-rendered shadow root. Before, the navigation did not load Lit's hydration support before the Page module, which imports `lit-element`, so the element rendered itself on the client and Chrome logged "Found declarative shadowrootmode attribute on a template". The router now loads the next document's global scripts, Lit's hydration support among them, before it imports the Page module, and the React boundary of a Foreign Subtree inserts its server HTML with `setHTMLUnsafe()`, which keeps declarative shadow roots.

    An Integration's global scripts are now tagged with `data-eco-global-script` in the page head, and `@ecopages/core/client` exports `loadNavigationGlobalScripts()` for a router that needs them in place before it imports a Page.

- [#1039](https://github.com/ecopages/ecopages/pull/1039) [`c093be3`](https://github.com/ecopages/ecopages/commit/c093be3141227ffb65566e7092c264b5b54b00b6) Thanks [@andeeplus](https://github.com/andeeplus)! - `ecopages start` from a complete build no longer plans routes at boot: it restores the asset ledger, seals it, and serves every Page, explicit view (`ctx.render`) and error page from what `ecopages build` recorded. Boot runs no route data hook and does not grow with the number of routes. A request compiles and writes nothing; a dependency the build did not record fails with "Run `ecopages build` again". A start from the source tree restores no ledger, so it never serves outputs older than its sources.

    To make that complete, `ecopages build` now records every dependency it processes, content scripts and stylesheets included, plans the views the server entry imports, bundles a hydrated React Page without the router in the app-wide build, and processes each planned route's dependencies before it writes the ledger. Static export renders each Page with the preparation its plan made, so data hooks still run once per Page, and a route instance that fails to plan fails the build unless the build keeps going past page failures (a route template or an imported view, planned without request props, logs a warning instead). Under a sealed start, a `cache: 'dynamic'` Page whose dependencies appear only at render time, or depend on per-request props, fails with "Run `ecopages build` again" instead of compiling. `processed-assets.json` is now version 3 and no longer lists route instances; run `ecopages build` again before `ecopages start`.

    The Lit static-render worker restores the ledger of the build it renders for, so an earlier build in the configured `distDir` no longer breaks Lit Pages.

    Breaking for Integration authors: `restoreProductionPageBrowserGraphs` from `@ecopages/core/build` is now `restoreProductionBrowserBuild(appConfig, { seal })`; `IntegrationRenderer.buildGroupedGraphBuildPlan` and `prebuildProductionPageBrowserGraph` are replaced by `planProductionRoutes`, which returns the plan, a `prepare` step and each instance's preparation, and `execute` accepts that preparation; `resolvePageBrowserGraphForFile` and `resolvePageBrowserGraphForRoute` are removed. A `collectPageBrowserGraphContribution` hook now returns a `PageBrowserGraphDeclaration`, which has no `assets`. A `prepareAssetDependencies` hook should return new dependency objects named from their own content, so every batch keys a script the same. `loadEcoPagesConfig` accepts `directories` to replace the configured `distDir` and `workDir`.

- [#1101](https://github.com/ecopages/ecopages/pull/1101) [`378442a`](https://github.com/ecopages/ecopages/commit/378442a0666b6a8a5a587f7791706a10ea4c0e35) Thanks [@andeeplus](https://github.com/andeeplus)! - An `ssr: true` script is now evaluated on the server by one preloader, the one for the Integration that owns it. With Radiant, a script on an Ecopages JSX Component goes to Ecopages JSX. Lit evaluates the scripts of Lit Components and of Components whose Integration has no preloader, such as Kita or React. Before, Lit also evaluated Radiant scripts on a Lit Page, so Radiant's server graph loaded twice.

    A Page also lists every Integration's global scripts in config order, before its Component scripts, whichever Integration owns it. Before, the owning Integration's came after the foreign ones.

    Breaking:

    - An Integration with a custom-element preloader declares which scripts it evaluates with `ssrScriptPreload` (`'own'` or `'own-and-foreign'`) on `IntegrationPlugin`, and its renderer gets the preloader from `createSsrScriptPreloader()` in the hook factory options.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`c904fb2`](https://github.com/ecopages/ecopages/commit/c904fb207ffcd8cb14c6127264cb5fb7ebc48979) Thanks [@andeeplus](https://github.com/andeeplus)! - Static export now picks a Page's output file from its own source file instead of from whether sibling Pages exist. A Page in an `index` file (`pages/blog/index.tsx`) always writes `blog/index.html`, and any other Page (`pages/blog.tsx`) always writes `blog.html`. Previously an `index` Page with no sibling wrote `blog.html` and moved to `blog/index.html` once a sibling Page such as `pages/blog/about.tsx` was added. Explicit static routes write `<route>.html`. The bundled static server and `ecopages start` resolve both layouts; hosts that read output files by path need to expect the new locations for these cases.

- [#1093](https://github.com/ecopages/ecopages/pull/1093) [`a1306ca`](https://github.com/ecopages/ecopages/commit/a1306cab979d7974d04722877b6406af30cb1cc9) Thanks [@andeeplus](https://github.com/andeeplus)! - Give `import styles from './card.css'` the same processed CSS in every environment. Server builds, browser bundles and the `ecopages dev` transform server now all compile a stylesheet imported with a binding through the app's stylesheet Processor into `export default "<css>"`, so an `ssr: true` Lit component renders its styles inside the declarative shadow root instead of an empty `<style>`, and a component whose CSS uses `@apply` is styled in development. A package module's own side-effect stylesheet import (`import './style.css'` inside a package that no component delivers) still fails `ecopages build`, now with an error naming the package module and the import and asking for the stylesheet in `eco.component({ dependencies: { stylesheets } })`, also when a CSS Processor is registered; `ecopages dev` warns once per import and keeps running. An error the stylesheet Processor throws fails `ecopages build`; in development the transform server keeps serving the last compiled module and shows the error until a save compiles again.

    CSS HMR now refreshes only the link of the stylesheet that changed: the `css-update` event carries the exact href the source was delivered at, and a module that imports the stylesheet as text gets a module `update` with the new CSS.

    Breaking: core's stylesheet module plugin runs before every Processor and Integration build plugin, so a build plugin's `load` hook for a stylesheet no longer runs; a Processor transforms stylesheets through `transformStylesheet`. `BuildOptions.stylesheetExtensions` is replaced by `BuildOptions.stylesheets` (`{ extensions, compileModule }`), which core's build requests set. `IClientBridge.cssUpdate(sourceFile)` takes the stylesheet source whose output changed and sends the href it resolves; a custom Processor that passed a source path keeps working, and one that passed an href must pass the source file instead.

- [#1100](https://github.com/ecopages/ecopages/pull/1100) [`eea38b2`](https://github.com/ecopages/ecopages/commit/eea38b2b330dd937d96e16cb4078d8da3b64dc26) Thanks [@andeeplus](https://github.com/andeeplus)! - Core now owns the development lifecycle of stylesheets, and a stylesheet Processor only transforms them.

    Breaking: `Processor.transformStylesheet(css, file)` returns `{ css, dependencies }` instead of a string. `dependencies` lists the absolute paths of the other files the transform read, such as the partials an `@import` inlined, and core keeps the stylesheets among them; take them from the transform (PostCSS `dependency` messages, Lightning CSS `dependencies`). To migrate a custom Processor, return `{ css }` where it returned the CSS string, and add `dependencies` when it inlines other files.

    - An edit to an `@import` partial rebuilds the stylesheets that inline it, whatever the form of the import (`layer()`, a media query, an unquoted `url()` or an alias). Their links refresh, modules that import them as text hot-update with the new CSS, and server modules that embed them, as for Lit SSR, are rebuilt.
    - A stylesheet Processor may implement `invalidateStylesheets(files)` to name the stylesheets a change to other files makes stale, or `'all'`. The PostCSS Processor uses it to recreate its plugins and rebuild `dependencyEntryPaths` (every entry when unset) after an edit to any file that is not a stylesheet, so Tailwind still finds new classes.
    - `writeSourceRelativeStylesheet` and `SourceRelativeStylesheetDirs` are no longer exported from `@ecopages/core/processor`, since core writes processed stylesheets itself.
    - `@ecopages/core/processor/contract` exports `stylesheetProcessorContract`, the cases a stylesheet Processor must pass.
    - `@ecopages/postcss-processor` no longer prewarms, caches, writes or broadcasts stylesheets itself and has no default `watch`. `PostCssProcessor.processPath`, `PostCssProcessor.processStringOrBufferSync`, `getFileAsBuffer` and the `ProcessPath` and `ProcessStringOrBufferSync` types are removed; use `PostCssProcessor.processStringOrBuffer`, or `transformWithPostcss` for the CSS with its dependencies. The package `main` and `types` now point at `src/index.ts`.
    - `@ecopages/file-system` adds `fileSystem.tempDir()`, the operating system's directory for temporary files.

- [#1125](https://github.com/ecopages/ecopages/pull/1125) [`b5d5a82`](https://github.com/ecopages/ecopages/commit/b5d5a8225577ceda27bd78befac6421e7d89ac45) Thanks [@andeeplus](https://github.com/andeeplus)! - A stylesheet Processor now declares the module types of the extensions it adds, so `import styles from './card.scss'` type-checks without a `declare module '*.scss'` in the app. Call the new `serializeStylesheetModuleDeclarations(this.getAssetCapabilities())` from `@ecopages/core/processor` in `setup()` and write the text into the Processor's generated `@types` package with `writeGeneratedTypesPackage` and `resolveGeneratedPath`; it declares `*.<ext>` and, for a capability with `cssModules: true`, `*.module.<ext>`, and is empty for `.css` alone. Core still ships only the `*.css` and `*.module.css` declarations. An app that wrote its own `declare module '*.scss'` can delete it once its Processor writes the declaration. The custom Processor guide shows the pattern.

- [#1072](https://github.com/ecopages/ecopages/pull/1072) [`8cda72b`](https://github.com/ecopages/ecopages/commit/8cda72bb22410679b850924eccd7230d9b1fcfda) Thanks [@andeeplus](https://github.com/andeeplus)! - Emit the fonts and images that processed stylesheets reference. A relative `url()` in a stylesheet run through your CSS Processor, such as the font files of `@import '@fontsource/inter'`, now resolves from the source file, and the file it names is written to `dist/client/assets` under a content hash with the reference rewritten, so it loads under `ecopages start`. The PostCSS presets rebase the relative `url()` references of the files `postcss-import` inlines onto the importing stylesheet. A reference to a missing file is left as written with a warning. In development the PostCSS processor's copy for CSS hot reload goes through the same step, so the fonts still load after a stylesheet edit.

    Stylesheet references, in your stylesheets and in package stylesheets, copy only fonts, images and media files and never a dotfile; a reference to any other file is left as written with a warning. A package stylesheet's references are no longer confined to its package, so it can name a sibling dependency's files in a monorepo, and its relative `@import` must name a `.css` file.

- [#1046](https://github.com/ecopages/ecopages/pull/1046) [`a038b9b`](https://github.com/ecopages/ecopages/commit/a038b9b3845fc1b7644fe5c3b468cf7b162b68b9) Thanks [@andeeplus](https://github.com/andeeplus)! - Build the file behind `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`, and the same with `SharedWorker`, in browser code as its own script. `ecopages build` writes each worker as a hashed file under `dist/client/assets`, records it for `ecopages start`, and points the URL at it; `ecopages dev` serves it through the dev transform server. A relative worker URL without `{ type: 'module' }` fails the build and the dev module request, since workers are built as ES modules. A relative URL with a query or a hash, and an inline script that starts a worker, fail the same way. Any other Worker URL, such as a `new URL()` held in a variable, is left as written with a warning naming the file.

### Patch Changes

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`0711bb7`](https://github.com/ecopages/ecopages/commit/0711bb77bdc1c7af2df3ce363e1a5083f1c30565) Thanks [@andeeplus](https://github.com/andeeplus)! - Build production browser entries of every Integration in one app-wide build, so a package or module that React islands, Lit scripts and other entries share is one chunk and is evaluated once. Entries only build apart when `define`, `minify`, `treeshaking` or plugin exclusions differ.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`abb8396`](https://github.com/ecopages/ecopages/commit/abb8396523f41fc62969e0f3f0cce0880f2dc88a) Thanks [@andeeplus](https://github.com/andeeplus)! - Build every Page's component scripts in the production app-wide browser build. Route preparation used to bundle each script on its own, so a package two scripts import, such as Lit, was loaded once per script; the scripts now share its chunk. `ecopages start` and the Lit static-render worker restore these outputs from `dist/server/processed-assets.json`.

    A lazy script entry is named after the Integration of the component that declares it, so a Lit component inside a Kita Page reuses its planned output instead of building it again.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`171663f`](https://github.com/ecopages/ecopages/commit/171663fca1b0e171478d0677b0ec71f7e3d53000) Thanks [@andeeplus](https://github.com/andeeplus)! - Keep script dependencies apart when they differ only in `define`, `treeshaking`, `splitting`, `excludeAppBuildPlugins` or a plugin's `cacheKey`. Two declarations of one script whose plugins share a name but not a `cacheKey`, or whose `define` differs, used to share one processed asset and could be served each other's bundle. A linked and an inline declaration of one stylesheet are also kept apart.

    A build moved to another folder, on any platform, now restores its component scripts and bundled Page scripts in `ecopages start`. Run `ecopages build` again before `ecopages start` with a build from an earlier version.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`604d6b6`](https://github.com/ecopages/ecopages/commit/604d6b6117e0225edf583c8575d9022fb0247350) Thanks [@andeeplus](https://github.com/andeeplus)! - `ecopages preview --serve-only` is accepted by the published CLI again. The `--keep-going` and `--serve-only` entry flags are now declared once in `@ecopages/core` and read by both the CLI wrapper and the app entry parser, so a new flag cannot be rejected by one and accepted by the other.

- [#1108](https://github.com/ecopages/ecopages/pull/1108) [`80fd65e`](https://github.com/ecopages/ecopages/commit/80fd65ee261384646ee59b7686df52cd74ba8992) Thanks [@andeeplus](https://github.com/andeeplus)! - Plain CSS with no Processor now works in a production build: core inlines the relative `@import`s of an app stylesheet (with their `layer`, `supports` and media conditions), copies the files the imported partials reference, and rebuilds the stylesheet in development when a partial changes or appears. A missing partial warns and names the importing file.

    One CSS scanner now serves every stylesheet path, so `image-set()` strings, escapes and `@import` conditions are read the same way when linking a stylesheet, bundling a Page's stylesheets and warning about relative URLs in an HTML Page.

- [#1111](https://github.com/ecopages/ecopages/pull/1111) [`4773d85`](https://github.com/ecopages/ecopages/commit/4773d8583d2ef74f795ddf2c7f045be339c90b2d) Thanks [@andeeplus](https://github.com/andeeplus)! - `@ecopages/core/processor` exports `scanCss`, `isExternalReference`, `splitReference`, `resolveProjectImportPath`, `resolvePackageStylesheetPath` and `inlineStylesheetImports`, so a stylesheet Processor can read and resolve `@import` the way core does. `@ecopages/core/processor/contract` exports `createRecordingBridge` and `DevelopmentStylesheetService` for a Processor's own development tests.

- [#1135](https://github.com/ecopages/ecopages/pull/1135) [`ecaf79f`](https://github.com/ecopages/ecopages/commit/ecaf79f2f0bf6dd9892e517d244c0afff8127ff6) Thanks [@andeeplus](https://github.com/andeeplus)! - A production build no longer plans a dynamic Page as a parameter-free route template when its `staticPaths` already lists entries. The build plans it once per entry with that entry's Params, so a Page whose Dependencies read its props no longer logs "Could not plan ... without request props".

- [#1141](https://github.com/ecopages/ecopages/pull/1141) [`9957081`](https://github.com/ecopages/ecopages/commit/9957081efba5a8fb98abedc2e31d2fc990b7809b) Thanks [@andeeplus](https://github.com/andeeplus)! - `@ecopages/core/processor` exports `tokenizeCss`, which splits a stylesheet into comment, string, escape, `url()`, word, whitespace and punctuation tokens, so a Processor can read the structure of CSS without mistaking a `{` or `;` inside a string, comment or escape for it.

- [#1145](https://github.com/ecopages/ecopages/pull/1145) [`f26326d`](https://github.com/ecopages/ecopages/commit/f26326dbd1aaa44fbde18047ea321caf9921330e) Thanks [@andeeplus](https://github.com/andeeplus)! - Keep `ecopages dev` usable while a stylesheet is broken. A Page request now renders with the stylesheet's last good output instead of answering 500, and renders without the stylesheet link when it never compiled since the dev server started. The same holds for the server build of a module that imports a stylesheet or CSS Module with a binding, which now gets the last good CSS or class map. The error shows in the browser overlay, also on a page that loads after the request, and a later HMR update no longer clears it. The next good save clears the overlay and updates the page. `ecopages build` and `ecopages start` still fail on a broken stylesheet. `IHmrManager` gains `reportBuildError(source, message)`.

- [#1050](https://github.com/ecopages/ecopages/pull/1050) [`66fde2f`](https://github.com/ecopages/ecopages/commit/66fde2fde0e6893e07cdc408f4e3e96f4a5fbd7a) Thanks [@andeeplus](https://github.com/andeeplus)! - Keep component state when a page or layout is saved in development. A page, layout or component template (Kita, Lit, MDX, HTML Page) that the browser does not load as a module now refreshes the page in place when a navigation runtime such as `@ecopages/browser-router` is active, and still reloads the document otherwise. On that refresh, `@ecopages/browser-router` compares each element's previous server markup with its new server markup and keeps every element that did not change, so custom elements keep their state and stay connected, and classes or attributes added at runtime stay. On that refresh, `data-eco-rerun` scripts no longer refresh the elements around them, so a rerun script must register handlers idempotently on every element that is not replaced. A module update that reloads the active page keeps state the same way. The router records this markup only in development, so production navigation does no extra work. Two limits remain: the first save after a full page load compares against the body as the router found it at start, so a component that rendered or changed its attributes on the client before then is replaced once; and state follows tree position, so identical sibling hosts can swap state when an earlier sibling is inserted or removed. Navigation to another URL is unchanged.

- [#1138](https://github.com/ecopages/ecopages/pull/1138) [`f5ec852`](https://github.com/ecopages/ecopages/commit/f5ec852827eaaa8fca00c74b35192822ce1af145) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix `eco.embed()` returning `unknown`: `ResultOf` now reads the return type of the component's callable signature, so the result is the component's element type (for example `string` or `JsxRenderable`). Code that relied on the `unknown` result keeps compiling unless it narrowed it with a cast that no longer matches.

- [#1114](https://github.com/ecopages/ecopages/pull/1114) [`90cb9ea`](https://github.com/ecopages/ecopages/commit/90cb9eaa22f847c5860748b0654f1b1b05530731) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix the layout of the built-in error pages. A page now fills the viewport, so the background gradient no longer repeats into a visible band, and the card no longer grows past a narrow viewport. On the development 500 page, a long unbroken message, such as a module path, wraps inside the card, and the message is shown once: when the stack opens with it, the separate message block is omitted. A message shown apart from the stack gets a monospace alert style, exposed as the `eco-error-page__diagnostic-message` class, and the stack box is capped at 22rem or half the viewport height, whichever is smaller.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`5e56009`](https://github.com/ecopages/ecopages/commit/5e56009967d6e84b57f03856da45b3feff1e85ad) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix `eco:page-load` never firing. The Browser Router and the React Router now dispatch it once on first load and after every committed navigation; it is skipped only when a newer navigation replaces the one that committed.

- [#1096](https://github.com/ecopages/ecopages/pull/1096) [`b76f196`](https://github.com/ecopages/ecopages/commit/b76f196a37e8a04c656cd56b31e1c7a4c5aa970a) Thanks [@andeeplus](https://github.com/andeeplus)! - A Page now loads the global scripts of every Integration it uses before its Component scripts, also when another Integration owns the Page. Before, a foreign Integration's global scripts came last, so on a Kita, React or Ecopages JSX Page Lit's hydration support ran after a server-rendered element was defined, and the element rendered its template a second time instead of hydrating.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`883a20c`](https://github.com/ecopages/ecopages/commit/883a20cd8320e5e23c35b46320f02d990e2ecc70) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix foreign-JSX files (for example `.kita.tsx`) in a React client graph skipping the React client-graph boundary. The foreign-JSX override is now a `transform` rather than an `onLoad`, so it composes with the boundary and server-only imports in those files are stripped before the browser build.

- [#1043](https://github.com/ecopages/ecopages/pull/1043) [`f887c63`](https://github.com/ecopages/ecopages/commit/f887c6394398d7580190ace4218661ba6bbd7022) Thanks [@andeeplus](https://github.com/andeeplus)! - A file of plain components that the server entry imports, directly or through a re-export, keeps its exports. Only a file with a default export becomes a view reference.

    Under Bun, a view imported through a tsconfig alias becomes a view reference to the right file, as it does under Node and in the build.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`af37fe8`](https://github.com/ecopages/ecopages/commit/af37fe8bc0faf3d632ef328b13c8b376a22105b8) Thanks [@andeeplus](https://github.com/andeeplus)! - A lazy Component whose render returns a fragment now keeps its sibling elements and puts `data-eco-trigger` on the first one, instead of being written into the Page as `[object Object],[object Object]`.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`bdd5c06`](https://github.com/ecopages/ecopages/commit/bdd5c06d404a8d58e5776508a8d7c6b3511443f1) Thanks [@andeeplus](https://github.com/andeeplus)! - Load Lit's SSR hydration support as a module of the app's browser graph instead of an inline script that carried its own pre-compiled `lit-html`. Every Lit page loaded two versions of Lit; it now loads one, from the app's install. The module is exported as `@ecopages/lit/hydrate-support`.

    An Integration's global scripts now join the production app-wide browser build. `IntegrationPlugin.getIntegrationDependencies()` returns them unprocessed and `refreshResolvedIntegrationDependencies()` reprocesses them in place.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`a0c9373`](https://github.com/ecopages/ecopages/commit/a0c9373acab41b6c75a245e4530e5fb21708b449) Thanks [@andeeplus](https://github.com/andeeplus)! - Fail `ecopages build` when a Page script or stylesheet cannot be bundled, such as a browser import of a `.server` module or a package CSS import, instead of logging the error, dropping the script and exiting 0.

- [#1122](https://github.com/ecopages/ecopages/pull/1122) [`834edb8`](https://github.com/ecopages/ecopages/commit/834edb8ec025c10f08eada32ccbae6ffa80f6449) Thanks [@andeeplus](https://github.com/andeeplus)! - Discover the extensions the stylesheet Processor declares in MDX documents. An `.mdx` page that writes `import './card.scss'` now links the processed stylesheet when the registered Processor declares `*.scss`, as a `.tsx` page already did. `createMdxLoaderPlugin` of `@ecopages/mdx/core` takes the app's stylesheet kinds as `stylesheets`; build them with the new `getStylesheetKinds` of `@ecopages/core/integration`. A side-effect import of a package file with a declared non-`.css` extension, such as `some-lib/theme.scss`, now fails the build naming the importer and the file, because packages must ship built CSS.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`cf135b1`](https://github.com/ecopages/ecopages/commit/cf135b1a02e5bc61b4e297a84d7435fd3304396c) Thanks [@andeeplus](https://github.com/andeeplus)! - Record the stylesheets and scripts a production build processed in `dist/server/processed-assets.json` and serve them from `dist/` at request time. A build copied to another folder or machine, or one whose `src/` was removed, keeps linking its Page stylesheets and scripts instead of dropping them with a `Skipping missing` warning.

- [#1071](https://github.com/ecopages/ecopages/pull/1071) [`a763a03`](https://github.com/ecopages/ecopages/commit/a763a036b9dc7831cc5eb26b60080f7781d417b2) Thanks [@andeeplus](https://github.com/andeeplus)! - Add `@ecopages/file-system/path`, path operations that always return forward slashes, with converters from native paths and `file:` URLs. `fileSystem.realpath`, `glob`, `readdir`, `readlink`, `mkdtemp` and watcher events now return paths in that form on Windows.

    Ecopages now holds every path in that form, so on Windows paths no longer leak backslashes into URLs, cache keys and generated imports, and a separator difference no longer breaks a path comparison. On Windows, resolved config paths (`rootDir` and `absolutePaths.*`) and the paths build plugins receive in `onResolve`, `onLoad` and `transform` are now forward-slash paths such as `D:/app/src/page.tsx`. A server build with `preserveModules` also names a module on another drive than its root instead of failing.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`121be12`](https://github.com/ecopages/ecopages/commit/121be12940d6c3e68c602178b6f4e4a9c1756ba9) Thanks [@andeeplus](https://github.com/andeeplus)! - Prebundle development dependencies in one code-split vendor graph, so a module shared by a package root and its subpath, by two packages, or required as CommonJS by two packages loads once in the browser. A dependency discovered after a page loaded vendor files that the rebuild changes reloads the page, and the discovered dependencies seed the next dev process.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`f14c921`](https://github.com/ecopages/ecopages/commit/f14c9213b440f535e0261810440911921671bb35) Thanks [@andeeplus](https://github.com/andeeplus)! - Publish `dist/server` with the same mode as `dist/client` instead of the owner-only mode of a temporary directory, so a deployed image can run the server as a non-root user.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`823234c`](https://github.com/ecopages/ecopages/commit/823234cf54364d857b6844a12ac74ad15c08d368) Thanks [@andeeplus](https://github.com/andeeplus)! - A page rendered while a production build plans its routes now links its component scripts; before, it could get a script tag without a URL.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`a918f0c`](https://github.com/ecopages/ecopages/commit/a918f0c46eebb59d80e3e8eea4c7d684edd64770) Thanks [@andeeplus](https://github.com/andeeplus)! - A missing Html template now fails with an error that names the expected `src/includes/html.<ext>` file and how to add it, instead of an import failure that told the user to run `ecopages build`.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`c9cd54a`](https://github.com/ecopages/ecopages/commit/c9cd54ab0554239ea55dea3395c263067fa2f5f5) Thanks [@andeeplus](https://github.com/andeeplus)! - Write Sitemap `<loc>` URLs from the configured `baseUrl` (config, `ECOPAGES_BASE_URL` or `--base-url`) instead of the local serve origin.

- [#1126](https://github.com/ecopages/ecopages/pull/1126) [`a91d95f`](https://github.com/ecopages/ecopages/commit/a91d95f0a4d058a3da443f4044d3bd7542a7c242) Thanks [@andeeplus](https://github.com/andeeplus)! - Internal fix: a Component another Integration owns no longer renders as a React element when its own Integration's browser code calls it on a page that also has a React Island. React now swaps the boundary in when it builds its own modules, and the browser `eco.component` factory renders inline for every caller. Nothing changes for how Components are written or imported.

- [#1099](https://github.com/ecopages/ecopages/pull/1099) [`4499261`](https://github.com/ecopages/ecopages/commit/449926197fa2bc41e7e4b180c5c4a491d89a7cea) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix a hydrated React Page or Island that renders a Component another Integration owns, such as a Lit Component imported into React MDX. React now keeps that Component's server HTML in an `<eco-foreign-subtree>` element instead of calling its `render` in the browser, which crashed hydration ("Objects are not valid as a React child"). A Lit element keeps its declarative shadow root and stays interactive, also after a React router navigation and an HMR update. In a tree that hydrates, React wraps each Foreign Subtree in the body in this `display:contents` element, so CSS that targets the foreign element as a direct child must account for it.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`57f6c2a`](https://github.com/ecopages/ecopages/commit/57f6c2a262ab0b1b01d41f9e557ea0581d09f4cf) Thanks [@andeeplus](https://github.com/andeeplus)! - Refuse a Node WebSocket upgrade with an HTTP error when the handler's `context()` rejects, instead of opening the socket and closing it with 1011.

- [#1056](https://github.com/ecopages/ecopages/pull/1056) [`a80bb61`](https://github.com/ecopages/ecopages/commit/a80bb61aabae07909a96fc67e42cb3c81ae18549) Thanks [@andeeplus](https://github.com/andeeplus)! - `ecopages start` now fails with "Run `ecopages build` again" when `dist/server/processed-assets.json` is missing, instead of starting unsealed and processing assets at request time. The PostCSS processor drops its runtime CSS loader, which shadowed the build loader in browser builds, so every stylesheet a browser build imports is processed by PostCSS.

- [#1088](https://github.com/ecopages/ecopages/pull/1088) [`2f09819`](https://github.com/ecopages/ecopages/commit/2f098197dc4cdc5e20ba92c97130630c200280f3) Thanks [@andeeplus](https://github.com/andeeplus)! - Fail the build when PostCSS cannot process a stylesheet. `PostCssProcessor.processPath`, `processStringOrBuffer` and `processStringOrBufferSync` now throw instead of returning an empty string, so `ecopages build` no longer writes an empty stylesheet and exits 0, and `ecopages dev` shows the error overlay with the file, line and column and keeps the last good stylesheet until the file is fixed. The first successful save after a failure always clears the overlay, even when its output equals the last good one, so no restart is needed. PostCSS warnings are logged with their file and line, and a stylesheet's warnings, including core's missing `url()` reference warning, are logged once instead of once per processing pass.

- [#1118](https://github.com/ecopages/ecopages/pull/1118) [`59b51d2`](https://github.com/ecopages/ecopages/commit/59b51d269019d8ee7db74686ace6fab11b0d373f) Thanks [@andeeplus](https://github.com/andeeplus)! - Keep the last instance of a stylesheet that is imported more than once when core inlines `@import`s, for app and package stylesheets. The cascade orders equal-specificity rules by their last occurrence, and Lightning CSS already did; core kept the first, so the same source ordered differently with and without a Processor.

- [#1059](https://github.com/ecopages/ecopages/pull/1059) [`507dca2`](https://github.com/ecopages/ecopages/commit/507dca219ea88f97bb864b0bf4c50db2c9b0456a) Thanks [@andeeplus](https://github.com/andeeplus)! - Keep serving the last good vendor output when a dev vendor-graph build fails as a whole, keep every entry in `dev-vendor-entries.json`, rebuild vendors after a package install without a restart, and build the new bare imports of one module in a single vendor build.

    `FileStats`, returned by `stat()` and `lstat()`, gains a required `mtimeMs` field; a custom `FileSystem` implementation must now return it.

- [#1150](https://github.com/ecopages/ecopages/pull/1150) [`c060354`](https://github.com/ecopages/ecopages/commit/c060354edb128cd9c76959f61f7259715a21e4ee) Thanks [@andeeplus](https://github.com/andeeplus)! - Keep installed compiled packages external on Windows when they sit on another drive than the build output directory. Their native bindings, such as the one in `oxc-resolver`, were bundled and failed to load.

- [#1048](https://github.com/ecopages/ecopages/pull/1048) [`71b8166`](https://github.com/ecopages/ecopages/commit/71b81664c98516027522afe5285697b3eaccc966) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix two Windows failures. Page files in subfolders, such as `pages/blog/[slug].tsx`, now become `/blog/[slug]` routes instead of routes with a backslash that no request matched, so nested and dynamic routes answered 404. Processor cache entries are now stored under a digest of their key, so a key with `:`, such as the image processor's, no longer fails to write.
- Updated dependencies [[`e7a129b`](https://github.com/ecopages/ecopages/commit/e7a129ba19003015bad6e64d40b191a46276273c), [`e7a129b`](https://github.com/ecopages/ecopages/commit/e7a129ba19003015bad6e64d40b191a46276273c), [`a763a03`](https://github.com/ecopages/ecopages/commit/a763a036b9dc7831cc5eb26b60080f7781d417b2), [`eea38b2`](https://github.com/ecopages/ecopages/commit/eea38b2b330dd937d96e16cb4078d8da3b64dc26), [`711dce1`](https://github.com/ecopages/ecopages/commit/711dce1055e730c1d5cc845545f0670de20403bc), [`507dca2`](https://github.com/ecopages/ecopages/commit/507dca219ea88f97bb864b0bf4c50db2c9b0456a)]:
    - @ecopages/dev-toolbar@0.7.0
    - @ecopages/file-system@0.7.0

## 0.6.1

### Patch Changes

- [#943](https://github.com/ecopages/ecopages/pull/943) [`e5c1162`](https://github.com/ecopages/ecopages/commit/e5c1162e3dd59d624d8ef72d9f4152e0b664c2e0) Thanks [@andeeplus](https://github.com/andeeplus)! - Prevent incoming stylesheets from affecting the outgoing page and preserve the cascade order of uniquely keyed styles during navigation. Fall back to full document navigation if a stylesheet replacement fails, retained CSS changes order while a retained style or stylesheet is persisted, or another update invalidates the prepared stylesheet order.

    Callers of `prepareNavigationHead()` must check `requiresReload` immediately before committing. If it is true, cancel the update and navigate the document instead. Custom implementations of `NavigationHeadUpdate` must provide the new property.

- [#944](https://github.com/ecopages/ecopages/pull/944) [`c3ba059`](https://github.com/ecopages/ecopages/commit/c3ba0598653139c9cde15bcb6164847017ba5009) Thanks [@andeeplus](https://github.com/andeeplus)! - Keep shared stylesheets applied during client-side navigation between layouts.
- Updated dependencies []:
    - @ecopages/dev-toolbar@0.6.1
    - @ecopages/file-system@0.6.1

## 0.6.0

### Minor Changes

- [#917](https://github.com/ecopages/ecopages/pull/917) [`a059041`](https://github.com/ecopages/ecopages/commit/a0590417e2e9909eecd0db7873597965aded52c8) Thanks [@andeeplus](https://github.com/andeeplus)! - `ecopages build` emits a Page Browser Graph for every parameter-free non-exact Template Route, every `staticPaths` entry of a Dynamic Page, and every `app.static` view (each of its `staticPaths` entries for a dynamic path), and records them in the browser client manifest. After `ecopages start` restores that manifest, a request whose graph is not listed is an error that names the route and the missing entry. It is never built.

    This is a breaking change: production no longer builds a new browser graph while serving. List every param-dependent graph in `staticPaths`. Development is unchanged.

- [#922](https://github.com/ecopages/ecopages/pull/922) [`6c6a6bf`](https://github.com/ecopages/ecopages/commit/6c6a6bf1f58aa14d43f370b27f03a3be8b20f8f8) Thanks [@andeeplus](https://github.com/andeeplus)! - Production `ecopages start` loads its routes and server modules from `dist/` and `node_modules/`. The build writes the filesystem route list into `dist/server/routes.json`; start loads that list and does not scan source Pages or compare source fingerprints. Start does not copy the source public directory into `dist/`; the build already did. The deploy manifest no longer records the source config path or hash. Start, through `ecopages start` or `node dist/server/app.mjs`, checks that `dist/` is complete (one build id, every listed output exists, the route list present). Production server output leaves `import.meta` pointing at the emitted files.

    This is a breaking change: a deploy that relied on source Pages at startup, source config identity checks, or production `import.meta` pointing at source files will fail. Declare files a production module reads next to itself in `serverFiles`, or move them to `public/`.

- [#933](https://github.com/ecopages/ecopages/pull/933) [`9652bc3`](https://github.com/ecopages/ecopages/commit/9652bc34afb2f092360bfd57c68350419ff29cd7) Thanks [@andeeplus](https://github.com/andeeplus)! - Move public build output into `dist/client/` and keep production server files in `dist/server/`. Nothing a static host publishes holds server code any more.

    This is a breaking change for existing deploys. After upgrading:

    - Rebuild. An output with only the old `dist/.server/` is not found by `ecopages start`.
    - Point a static host's output directory at `dist/client` instead of `dist`.
    - Start the server with `node dist/server/app.mjs` (or `bun dist/server/app.mjs`) instead of `dist/.server/app.mjs` in Dockerfiles and process managers.
    - Write processed images into `dist/client/images` instead of `dist/images`; an image processor `outputDir` left at `dist/images` writes outside the served folder and its images return 404. Processors receive `distDir` pointing at `dist/client/`.

- [#921](https://github.com/ecopages/ecopages/pull/921) [`e8e4344`](https://github.com/ecopages/ecopages/commit/e8e4344aaf001403b77aa9a4946ff9e9ea20c748) Thanks [@andeeplus](https://github.com/andeeplus)! - Import a view and pass it to `ctx.render`, `ctx.renderPartial`, `app.static`, and error pages. Development reloads an edited view and a component it imports without restarting the process. Production serves the built module and does not compile.

    This is a breaking change: `ctx.renderServerModule`, `ctx.importServerModule` on the render context, string and URL view paths, and `createViewModuleLoader` are removed. Import the view instead of passing its path.

- [#918](https://github.com/ecopages/ecopages/pull/918) [`b5f1c8b`](https://github.com/ecopages/ecopages/commit/b5f1c8bdd7d466783f0df9e2ca145fa89636aba9) Thanks [@andeeplus](https://github.com/andeeplus)! - `ecopages build` emits each Processor's runtime output into `dist/server/` and registers it in `server-modules.json`, including content collection manifests and server modules. `ecopages start` restores that output and does not call Processor `setup()`. Invalid collection frontmatter fails the build. Development still regenerates collections when an MDX file is edited.

    This is a breaking change: production no longer scans sources or writes under `.eco/` in Processor `setup()`. A Processor that needs request-time modules lists them with `listProductionServerModuleEntries()` and restores them with `restoreProductionRuntime()`.

- [#915](https://github.com/ecopages/ecopages/pull/915) [`73e4a03`](https://github.com/ecopages/ecopages/commit/73e4a03df266f1272882a90f0a60fe15e85996f4) Thanks [@andeeplus](https://github.com/andeeplus)! - `ecopages build` emits every server entry into `dist/server/` and writes `server-modules.json`. `ecopages start` imports that map and never compiles. Production emit activates Integrations before importing those modules, so an Integration can install process globals in `setup()`.

    This is a breaking change: production no longer compiles Pages, Layouts, Html shells, Endpoints, `app.static` views, error pages, or `ssr: true` scripts from source. A missing entry names the file and says to run `ecopages build`. Development is unchanged.

- [#928](https://github.com/ecopages/ecopages/pull/928) [`ea0d42d`](https://github.com/ecopages/ecopages/commit/ea0d42d4eb0368bfd2d93e5bb5e8a706d32eaa95) Thanks [@andeeplus](https://github.com/andeeplus)! - Use native recursive filesystem watchers, support adding paths to a running watch, report directory changes, and handle missing watch roots. When a native event omits its filename, reconcile the root and may emit rescan events for mapped requested roots; the Project Watcher coalesces them into a runtime restart request. Native events are coalesced for 50 ms, so a change may be reported while a file is still being written. If registration through `add()` fails, the new paths are rolled back so the same paths can be retried. Permission-denied children are skipped during indexing so accessible siblings remain watched. Remove Chokidar from file-system and core.

- [#929](https://github.com/ecopages/ecopages/pull/929) [`2d92e9f`](https://github.com/ecopages/ecopages/commit/2d92e9f9c81f5f993ea8b7f61342365f0aafa7d8) Thanks [@andeeplus](https://github.com/andeeplus)! - The active Project Watcher activates linked workspace roots only for recorded inputs: unused linked packages no longer trigger restarts, while changes to a used package still do.

### Patch Changes

- [#924](https://github.com/ecopages/ecopages/pull/924) [`0d8d251`](https://github.com/ecopages/ecopages/commit/0d8d251dd38991277e454dcdddd6f9faf5b3ef98) Thanks [@andeeplus](https://github.com/andeeplus)! - Keep deep preserved-module filenames within filesystem limits and retain production manifest parse errors.

- [#909](https://github.com/ecopages/ecopages/pull/909) [`3b74da3`](https://github.com/ecopages/ecopages/commit/3b74da3e25f64004e1098e25b1ca5ad63ace5e7a) Thanks [@andeeplus](https://github.com/andeeplus)! - Install the server DOM once at startup, Radiant first and Lit second, so Lit elements still render after a Radiant element in the same process.

- [#913](https://github.com/ecopages/ecopages/pull/913) [`0a9c069`](https://github.com/ecopages/ecopages/commit/0a9c0692dee75708854b20d0bad19c7b671bc2b1) Thanks [@andeeplus](https://github.com/andeeplus)! - Lit Pages render in-process when serving. The Lit render worker starts only for static export and is released when the export ends.

- [#932](https://github.com/ecopages/ecopages/pull/932) [`a79e6f9`](https://github.com/ecopages/ecopages/commit/a79e6f9ed70e135f489ba4d728af7b52f62ff738) Thanks [@andeeplus](https://github.com/andeeplus)! - Production server loaders preserve bundle context when imported by a wrapper, so startup loads the emitted config and rejects incomplete dist output.

- [#920](https://github.com/ecopages/ecopages/pull/920) [`cfd553a`](https://github.com/ecopages/ecopages/commit/cfd553a4faa19c494c8c39d28e86d3b841d5eb93) Thanks [@andeeplus](https://github.com/andeeplus)! - Watch-mode requests and Page prewarm wrap in the build-queue request scope and record filesystem inputs on the app's build-input index. Non-watch production and preview requests do not.

- [#910](https://github.com/ecopages/ecopages/pull/910) [`253b702`](https://github.com/ecopages/ecopages/commit/253b702a7622e69af6b6d5c19ea92a2de5358ba0) Thanks [@andeeplus](https://github.com/andeeplus)! - Stop serve-only preview from copying `src/public` into the build it serves, so a finished `dist/` is left as the build wrote it.

- [#935](https://github.com/ecopages/ecopages/pull/935) [`40c661d`](https://github.com/ecopages/ecopages/commit/40c661d3841d3117a261efc181fb9af4ba63707e) Thanks [@andeeplus](https://github.com/andeeplus)! - A production server bundle started with Bun (`bun dist/server/app.mjs` or `ecopages start --runtime bun`) now loads its emitted config and checks that `dist/` is complete, as it does under Node. `ecopages start` without `--dist-dir` no longer mistakes a project folder that holds a `server/manifest.json`, such as `src/server/`, for a build output.

- [#911](https://github.com/ecopages/ecopages/pull/911) [`fbacb7c`](https://github.com/ecopages/ecopages/commit/fbacb7cd1a9d73c13776fa570d1fe53b84cd2d96) Thanks [@andeeplus](https://github.com/andeeplus)! - Wait for in-flight page-cache regenerations before Integration teardown when the app stops, so a stale revalidating-cache Page cannot keep rendering after its Integration is released.

- [#931](https://github.com/ecopages/ecopages/pull/931) [`6b8b8ac`](https://github.com/ecopages/ecopages/commit/6b8b8acf46f0853930aeb25370bce38674ef623e) Thanks [@andeeplus](https://github.com/andeeplus)! - `watch()` no longer descends into subtrees its `ignored` predicate ignores without stats, so on Linux a recursive root does not open kernel watches for `node_modules` and similar folders. A directory removed while it is being indexed is treated as gone instead of reported as a watcher error, a directory found after `close()` opens no new native watcher, and a folder allowed by a later `add()` reports its changes. The development watcher also reports a build input recorded after startup when it lies under an additional watch path base, and production start rejects an unreadable browser client manifest instead of starting without it.
- Updated dependencies [[`09f64d9`](https://github.com/ecopages/ecopages/commit/09f64d954261b842c7cfbb64607ef9f8119ede06), [`6c6a6bf`](https://github.com/ecopages/ecopages/commit/6c6a6bf1f58aa14d43f370b27f03a3be8b20f8f8), [`ea0d42d`](https://github.com/ecopages/ecopages/commit/ea0d42d4eb0368bfd2d93e5bb5e8a706d32eaa95), [`6b8b8ac`](https://github.com/ecopages/ecopages/commit/6b8b8acf46f0853930aeb25370bce38674ef623e)]:
    - @ecopages/dev-toolbar@0.6.0
    - @ecopages/file-system@0.6.0

## 0.5.0

### Minor Changes

- [#879](https://github.com/ecopages/ecopages/pull/879) [`febb034`](https://github.com/ecopages/ecopages/commit/febb0347326a0a985c8c1ede038cd325810723f6) Thanks [@andeeplus](https://github.com/andeeplus)! - Load a collection's MDX component through one specifier on both sides. `ecopages:content/<collection>/component` exports `loadComponent(slug)`: the server graph returns the entry wrapped for cross-Integration rendering, and the Page Browser Graph returns the browser-compiled entry. An unknown slug rejects with `HttpError.NotFound` on both. `/server` keeps `getComponent()` and `getEntryDependencies()` and is still rejected in the Page Browser Graph.

    Breaking: `ecopages:content/<collection>/browser` is removed, along with its generated type declarations, the `CONTENT_BROWSER_VIRTUAL_MODULE_PATTERN` export of `@ecopages/core/build` (replaced by `CONTENT_COMPONENT_VIRTUAL_MODULE_PATTERN`), and the `'browser'` variant of `parseCollectionSpecifier()`, which is now `'component'`. The `ContentCollectionBrowserModule` type of `@ecopages/content-processor/types` is renamed `ContentCollectionLoaderModule`.

    To migrate: change `import { loadComponent } from 'ecopages:content/<collection>/browser'` to `'ecopages:content/<collection>/component'`. Run `ecopages types`, `ecopages dev` or `ecopages build` once to regenerate the declarations.

- [#888](https://github.com/ecopages/ecopages/pull/888) [`c143a6e`](https://github.com/ecopages/ecopages/commit/c143a6e3a6c039954c9d094ededb27034c1bddc7) Thanks [@andeeplus](https://github.com/andeeplus)! - Route render errors are wrapped only by core, as `Error rendering page`, keeping the original error as `cause` and passing an `HttpError` through. React no longer prefixes `Failed to render component`; Ecopages JSX no longer prefixes `Error rendering component`.

- [#881](https://github.com/ecopages/ecopages/pull/881) [`fbc00ac`](https://github.com/ecopages/ecopages/commit/fbc00ac4c2d4fdbd856f1fd3bb0d4f4d3ed90f77) Thanks [@andeeplus](https://github.com/andeeplus)! - A development render (`NODE_ENV=development`) now fails when a Foreign Child with Dependencies that the route never declared is rendered under a parent that already has a declared Foreign Child. The error names the component's file. Route preparation does not collect such a component's stylesheets and scripts, and rendering no longer adds them, so in production it renders without them.

    To migrate: import the component statically from the module that declares it with `eco.component()` (a named re-export works, `export *` does not), list it in its parent's `dependencies.components`, or return it in `components` from the Page's `dependencies` function. A component that is declared but reached only under a parent without an identity file (for example a view not declared with `eco.component()` in its own module) fails with its own message: declare that parent with `eco.component()` in its own module, or list the component from a parent that has one. Production renders are not checked.

- [#887](https://github.com/ecopages/ecopages/pull/887) [`09da5cf`](https://github.com/ecopages/ecopages/commit/09da5cf45c20d5cb155c13123f396e98fd4d9d1c) Thanks [@andeeplus](https://github.com/andeeplus)! - A page's stylesheets and scripts are now collected once, before the page renders, from the Dependencies of every component the route declares and from the Page's `dependencies`. Rendering no longer adds assets.

    **Breaking for apps:** a Foreign Child the route never declares now renders in production without its stylesheets and scripts; a development render fails for it when its parent has a declared Foreign Child descendant. To migrate, import the component statically from the module that declares it with `eco.component()`, list it in its parent's `dependencies.components`, or return it in `components` from the Page's `dependencies` function.

    **Breaking for Integration authors:**

    - `ComponentRenderResult` no longer has `assets`. A `renderComponent` hook returns the component's HTML, `canAttachAttributes`, `integrationName` and optional `rootAttributes`; declare the component's files in its Dependencies instead of returning them.
    - `DocumentShellComposeChildrenResult` is now `{ children }`, and `DocumentShellComposeChildrenContext` no longer has `primaryRender`.
    - `PageClientBrowserAssets` no longer has `islandRenderAssetsByFile`, and `PageClientBuildEntry` no longer has `islandFile`; a `buildIslandClientAssets` hook returns its island and lazy-entry assets in `processedAssets` only.
    - The hook factory no longer receives `resolveComponentDependencies()`.
    - `@ecopages/core/integration` no longer exports `mergePageBrowserGraph()`; the page package is final once prepared, so there is nothing to merge a page browser graph into.
    - For `IntegrationRenderer` subclasses: `appendProcessedDependencies()`, `getActiveIslandRenderAssets()` and `collectIslandRenderAssets()` are removed, as are `dedupeProcessedAssets()`, `injectPageAssets()` and `applyAttributesToFirstBodyElement()` on `this.htmlTransformer`, `resolveQueuedForeignSubtrees()` resolves to the HTML string, and `transformRouteResponse()` reads the page package from its render options instead of a separate argument.

### Patch Changes

- [#877](https://github.com/ecopages/ecopages/pull/877) [`d551580`](https://github.com/ecopages/ecopages/commit/d55158002bf16b02057eb8b434d60a34a0dd1149) Thanks [@andeeplus](https://github.com/andeeplus)! - In `ecopages dev`, a package that several browser dependencies import loads once. Each dependency was prebundled with its own copy of the packages it imports, so libraries that rely on one module instance broke in development only: for example, a Tiptap editor failed with "Adding different instances of a keyed plugin". Dependencies are now served one package per file, and an `import` of another package points at that package's file. Production builds are unchanged.

    Build plugins' `onResolve` callback also receives `kind`, how the importer refers to the module (`import-statement`, `dynamic-import`, `require-call`, …).

- [#870](https://github.com/ecopages/ecopages/pull/870) [`bf42314`](https://github.com/ecopages/ecopages/commit/bf42314d5369348a99cae49ebb0680505c0fe3d4) Thanks [@andeeplus](https://github.com/andeeplus)! - `ecopages build` accepts a Page on a dynamic route (`[id]`, `[...slug]`) with `cache: 'dynamic'` and no `staticPaths`. Such a Page renders on each request, so the build no longer fails with "Missing getStaticPaths".

- [#869](https://github.com/ecopages/ecopages/pull/869) [`7a2649d`](https://github.com/ecopages/ecopages/commit/7a2649ddf4500f6c9b205ad68b3fb89cd79ba789) Thanks [@andeeplus](https://github.com/andeeplus)! - An `HttpError` thrown from an endpoint file now answers with its status and JSON body, as it does from an `app.ts` route. It answered `500` before, because the endpoint file loads its own copy of `@ecopages/core/errors`.

- [#858](https://github.com/ecopages/ecopages/pull/858) [`92c017e`](https://github.com/ecopages/ecopages/commit/92c017ea24cf86d56c315e0cc56f1b9fef228115) Thanks [@andeeplus](https://github.com/andeeplus)! - Type an `eco.html()` shell's `children` and `headContent` with the element type it is given. `eco.html<JsxRenderable>()` or `eco.html<ReactNode>()` now renders `{children}` and `{headContent}` without a cast; they were typed as the default element type before.

    To migrate: a `Head` component that receives `headContent` as its children declares its props with the same element type, `eco.component<PageHeadProps<JsxRenderable>, JsxRenderable>()` (or `PageHeadProps<ReactNode>` with React) instead of `PageHeadProps`. Casts such as `{children as 'safe'}` can be removed.

- Updated dependencies []:
    - @ecopages/dev-toolbar@0.5.0
    - @ecopages/file-system@0.5.0

## 0.4.0

### Minor Changes

- [#835](https://github.com/ecopages/ecopages/pull/835) [`fd88c3a`](https://github.com/ecopages/ecopages/commit/fd88c3ab8a07a4c7248b6fbcd8d35a71cb176ac1) Thanks [@andeeplus](https://github.com/andeeplus)! - Serve API routes from files: a file under the pages directory ending in `.api.ts`, `.api.tsx`, `.api.js` or `.api.jsx` is an endpoint whose URL is its path with the whole `.api.*` ending dropped. `src/pages/api/users/[id].api.ts` answers `/api/users/[id]`, with `index.api.ts` and `[...slug].api.ts` following the Page naming rules. The file exports one handler per method, built with the method helpers without `path` (`export const GET = defineGet({ handler })`), and answers through the same pipeline as `app.add()` routes: params (a catch-all as an array), schema validation, middleware and `app.onError`. A method the file does not export answers `405` with an `Allow` header. In `ecopages dev`, saving the file serves its new handlers without a restart.

    Rules: two files on the same route, whatever the parameter names, fail discovery with the duplicate-route error, which now also catches two Pages such as `[slug].tsx` beside `[id].tsx`, and `users.api.ts` beside `users.api.js`. The `.api.*` endings are reserved: an Integration whose `extensions` include one fails config finalization with an error naming it; `.tsx` itself stays a page extension, and `users.api.tsx` is still an endpoint. An `app.ts` route on an endpoint's route keeps the methods it registers, and startup logs a warning naming both. An endpoint file whose URL ends in a known static file extension, such as `feed.xml.api.ts`, fails discovery; register that URL in `app.ts`. Endpoint files are never statically generated, listed in the sitemap or prebuilt as Pages, even when `.ts` is a registered Page extension.

    Build and production: `ecopages build` imports every endpoint file and checks its exports before bundling, so a file with no method export, a method export built for another method, or one that sets `path` fails the build with an error naming the file and its URL. `--keep-going` does not skip this check. A build whose only handlers are endpoint files now writes `dist/.server/`, so `ecopages start` runs it.

    Helpers: `defineGet`, `definePost` and the other method helpers accept a handler without `path`; with `path` they behave and infer as before. The `api.get` / `api.post` helpers inside `defineGroupHandler` still require `path`, and `app.add()` and `app.group()` throw for a handler without one.

- [#847](https://github.com/ecopages/ecopages/pull/847) [`43e3d43`](https://github.com/ecopages/ecopages/commit/43e3d43d43e5fd585231c84f0f2c2690a2047ad4) Thanks [@andeeplus](https://github.com/andeeplus)! - Type the handler context the same way however a route is defined. A field the route's `schema` declares takes the schema's output type; a field it omits keeps its untyped shape, so a route with only `schema.body` still reads `params` as `PageParams` and `query` as parsed query values instead of `unknown`. Inline routes (`app.get()`, `app.post()` and the other method calls, `app.route()`, and the routes of `app.group()`) now type the handler from their `schema` and middleware, and `api.get()`, `api.post()` and the other method helpers inside `defineGroupHandler` receive the context the group middleware adds.

    API handlers now type `ctx.query` as the parsed query values. Page middleware no longer declares `query`, which it never received; read the query string from `request.url`.

    The handler context now comes from the route's `schema`, its middleware and its group, not from a type annotation on the handler's parameter. A route's handler sees the fields every one of its middleware adds, and a group's routes see what every group middleware adds, so a route with `middleware: [withSession, withLocale]` reads both `ctx.session` and `ctx.locale` without type arguments. A handler annotated with a context that no middleware on its route adds no longer compiles. An inline middleware function in a `middleware` list is typed with the base context.

    TypeScript types the handler against the middleware it has already seen, so in a `define*` call put `middleware` before `handler`. In `app.get()` and the other method calls the handler comes first, so declare every middleware in the list as a `Middleware` or `EcoMiddleware` constant, or annotate an inline function with `ApiHandlerContext` and the now exported `MiddlewareNext`: one unannotated inline function makes the handler lose the context of the whole list, constants included.

    The exported handler context type `TypedGroupHandlerContext` is renamed `RouteHandlerContext`, with no alias. `RouteOptions` now takes the route's schema and middleware list as type parameters instead of a context type.

    To migrate:

    - Replace `RouteOptions<Request, unknown, MyContext>` with `RouteOptions<Request, unknown>`; the context now comes from the `middleware` list.
    - Remove a handler's context annotation and put the middleware that provides those fields in `middleware`, or keep the annotation and pass the context as the route's explicit type argument.
    - Rename `TypedGroupHandlerContext` to `RouteHandlerContext`; the type parameters are unchanged.

- [#842](https://github.com/ecopages/ecopages/pull/842) [`9370261`](https://github.com/ecopages/ecopages/commit/9370261c7e68b321b6ccad5feec57e2b1a276857) Thanks [@andeeplus](https://github.com/andeeplus)! - Support the HTTP QUERY method (RFC 10008), a safe, idempotent read whose request body carries the query. Add `defineQuery`, `app.query(path, handler, options)`, `api.query` in `defineGroupHandler` and `query` on the route group builder, and let an endpoint file `export const QUERY = defineQuery({ ... })`. A `schema.body` is validated as for `POST` (`400` on invalid input, `415` for a body with a missing or unsupported `Content-Type`), and without it the handler reads `request` itself. A file that does not export `QUERY` answers a QUERY request with `405` and an `Allow` header that omits it. Ecopages does not cache QUERY responses and does not set `Accept-Query` or `Vary`; handlers set them.

### Patch Changes

- [#846](https://github.com/ecopages/ecopages/pull/846) [`711ae17`](https://github.com/ecopages/ecopages/commit/711ae174bab888f316d7de402174f95620558859) Thanks [@andeeplus](https://github.com/andeeplus)! - Dynamic filesystem routes now match by specificity: segments are compared from the left and a literal segment wins over a parameter, as catch-all routes already did. `src/pages/api/[id].tsx` answers `/api/5` instead of `src/pages/[section]/[slug].tsx`.

- [#856](https://github.com/ecopages/ecopages/pull/856) [`4e4c1c4`](https://github.com/ecopages/ecopages/commit/4e4c1c4a6a55a0b4005e727274b8eb32665e7a5a) Thanks [@andeeplus](https://github.com/andeeplus)! - `ApiHandler.middleware` is typed as the same read-only `MiddlewareList` that `RouteOptions.middleware` and a group's `middleware` use, with no `any`; `MiddlewareList` is now exported. A handler's middleware list can no longer be pushed to after it is built.

- [#836](https://github.com/ecopages/ecopages/pull/836) [`2db3a30`](https://github.com/ecopages/ecopages/commit/2db3a30bc9666b2896d30be3ec623602d2d488ea) Thanks [@andeeplus](https://github.com/andeeplus)! - Correct the documentation of handler Params typing: the `path` string selects the URL and does not type `params`; `schema.params` types and validates them.
- Updated dependencies []:
    - @ecopages/dev-toolbar@0.4.0
    - @ecopages/file-system@0.4.0

## 0.3.2

### Patch Changes

- [#828](https://github.com/ecopages/ecopages/pull/828) [`a7e4217`](https://github.com/ecopages/ecopages/commit/a7e42178e12300d0bdb19fe1ac89b67c6c197a76) Thanks [@andeeplus](https://github.com/andeeplus)! - Keep a browser script or stylesheet inside `dist` when its source is outside `src`. A production build no longer writes that bundle, or its hashed-asset index, into another package.

- [#826](https://github.com/ecopages/ecopages/pull/826) [`3db914f`](https://github.com/ecopages/ecopages/commit/3db914f33894366b48a011c78b326d59d1f668a9) Thanks [@andeeplus](https://github.com/andeeplus)! - The "next free" port suggested when the preferred port is in use now checks the address the app binds, instead of always checking `127.0.0.1`. The check resolves the configured hostname to a single address first, so a port taken on that address is no longer reported as free.

- [#824](https://github.com/ecopages/ecopages/pull/824) [`c9e99d6`](https://github.com/ecopages/ecopages/commit/c9e99d6dd7caf30bc39549b3b037fbb247041c93) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix four development and lifecycle edge cases:

    - Calling `stop()`, then `start()`, then `stop()` again before the first stop finishes now leaves nothing running. Before, the queued `start()` brought the server back after the last `stop()` had resolved.
    - In preview mode, the `start()` callback no longer runs, and the server-running notice is no longer logged, when `stop()` is called while the static build is still running.
    - Editing a file that declares several React islands now hot-updates all of them, not only the last one. When an edit renames an island's declaration so the updated module no longer exports it, the page reloads instead of rendering another export of the file in its place.
    - A build error from a script change now stays visible when the same save reloads the page: the browser shows it again after the reload, and on every later page load until the file is fixed. The error is sent once instead of twice.

    Correction to 0.3.1: that release removed `IHmrManager.handleFileChange` and the `graphIdentities` fields from the integration contract, although it shipped as a patch. Integrations that implement or call them must adapt: call `handleFileChanges()` with a one-item list, and stop reading or setting `graphIdentities`.

- [#825](https://github.com/ecopages/ecopages/pull/825) [`e8985f1`](https://github.com/ecopages/ecopages/commit/e8985f10b5434c191e8308368fb119390aa53c1c) Thanks [@andeeplus](https://github.com/andeeplus)! - Detect a taken port under Bun. When the dev or preview port was already in use on `localhost`, Bun bound the server to another address that `localhost` resolves to, so two servers listened on the same origin and requests were split between them. The server now binds the same single address on Bun and Node, so a taken port falls back to the next free port, or fails when the port is pinned with `--port` or `ECOPAGES_PORT`.
- Updated dependencies [[`4026351`](https://github.com/ecopages/ecopages/commit/40263519401705b54e90efc8ce93c2bf70cdb9e5)]:
    - @ecopages/file-system@0.3.2
    - @ecopages/dev-toolbar@0.3.2

## 0.3.1

### Patch Changes

- [#789](https://github.com/ecopages/ecopages/pull/789) [`8ebf1bf`](https://github.com/ecopages/ecopages/commit/8ebf1bf200754867a666b8cfc4bcbb32d55c0381) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix relative links navigating to the wrong URL. A link such as `?page=2` on `/blog` or `next` on `/docs/intro` now resolves against the current page and any `<base href>`, as a full page load would, instead of against the site root.

- [#797](https://github.com/ecopages/ecopages/pull/797) [`6d58f32`](https://github.com/ecopages/ecopages/commit/6d58f32800199fb5e6dbc15cbdc2309bbdd5ea34) Thanks [@andeeplus](https://github.com/andeeplus)! - Give each component, layout and page declared in one file its own identity. Before, every `eco.*` declaration in a file shared one `config.identity.id`, so a second React island from that file hydrated as the first, an SPA navigation between two layouts exported from one file kept the first layout, and a layout stack built from one file rendered its outer layout twice.

    `config.identity.id` is now distinct for each declaration and stays the same while unrelated code in the file changes; `config.identity.file` is still the module path shared by every declaration in the file. Integrations that tell components apart by `identity.file` should use `identity.id` instead, and keep `file` for per-module work such as bundling and watching.

- [#799](https://github.com/ecopages/ecopages/pull/799) [`db6ec28`](https://github.com/ecopages/ecopages/commit/db6ec28fbb674ff716f70b2f441b13f4f3101772) Thanks [@andeeplus](https://github.com/andeeplus)! - Content collections now recover in development after an entry fails schema validation: saving the fixed file updates the collection instead of repeating the old error until a restart. Errors thrown by a processor while handling file changes now appear in the browser error overlay, and editing an entry's frontmatter and body together refreshes the compiled collection. The content-processor README examples no longer pass the removed `mdx.enabled` option.

- [#788](https://github.com/ecopages/ecopages/pull/788) [`d7a5bee`](https://github.com/ecopages/ecopages/commit/d7a5bee78fc670398b50b5da215c5d91cdccddbd) Thanks [@andeeplus](https://github.com/andeeplus)! - A build error from one file in a multi-file save now stays visible instead of being cleared by the hot update of another file in the same save. A hot update that cannot be applied, for example because a module throws when it is evaluated, now reloads the page instead of leaving a stale page. The file system toolkit gains `realpath`, and the workspace package watcher uses it instead of `node:fs`.

- [#810](https://github.com/ecopages/ecopages/pull/810) [`c2cd071`](https://github.com/ecopages/ecopages/commit/c2cd071b724888f5d0af6fe7c52bb33914f9e539) Thanks [@andeeplus](https://github.com/andeeplus)! - Remove the single-file change method from the HMR manager contract that integrations receive; pass a one-item list to `handleFileChanges()` instead. HMR client events and file-change options no longer carry the unused `graphIdentities` field.

- [#786](https://github.com/ecopages/ecopages/pull/786) [`b0e4a80`](https://github.com/ecopages/ecopages/commit/b0e4a801a32257a39d9d12acc3221706b7cfcf84) Thanks [@andeeplus](https://github.com/andeeplus)! - Production `ecopages start` now keeps using the prebuilt browser assets for every render of a route, not only the first. Pages that are not served from the HTML cache, such as `cache: 'dynamic'` pages, expired revalidating pages and query variants, no longer fall back to request-time builds that produce different script URLs than the first response.

- [#787](https://github.com/ecopages/ecopages/pull/787) [`46b4a4a`](https://github.com/ecopages/ecopages/commit/46b4a4abf11c7d7109acc35184b26a887058d31f) Thanks [@andeeplus](https://github.com/andeeplus)! - Render and import failures now keep their original stack in development logs. A page that throws while rendering, or fails to import, previously logged only `Error importing page file: Error: x` or `Error rendering page: x` without a stack or code frame; the log and the development error page now include the original error and its stack. Production error responses still contain no stack.

- [#814](https://github.com/ecopages/ecopages/pull/814) [`0857ed4`](https://github.com/ecopages/ecopages/commit/0857ed44eb12f0cba2e47c257a56491ba3448021) Thanks [@andeeplus](https://github.com/andeeplus)! - Smaller packages. The published tarballs no longer include browser test files, test helpers and test fixtures, which imported a test runner that is not installed with the package, nor the architecture READMEs that live beside the source (the package README stays and links to them in the repository). `@ecopages/react`, `@ecopages/dev-toolbar` and `@ecopages/image-processor` also stop installing dependencies they never used.

- [#806](https://github.com/ecopages/ecopages/pull/806) [`040c48d`](https://github.com/ecopages/ecopages/commit/040c48d2e24d50f943c098a29ff74a3512cfddf4) Thanks [@andeeplus](https://github.com/andeeplus)! - A build that another build waits for, such as a content collection bundle, now starts at once even when it is itself waiting on such a build, so chained collection builds no longer hang on machines with two cores.

    Foreign JSX handling now matches multi-dot extensions such as `.kita.tsx` exactly, and an app whose Integrations own no `.ts`, `.tsx`, `.js` or `.jsx` extension, such as an MDX and HTML app, no longer runs component identity attribution on every module, `node_modules` included.

- [#784](https://github.com/ecopages/ecopages/pull/784) [`15c4275`](https://github.com/ecopages/ecopages/commit/15c4275e5c757e3e66b28ad77797293829362dd4) Thanks [@andeeplus](https://github.com/andeeplus)! - Responses that set several cookies now deliver all of them to the client instead of only the last one.

- [#805](https://github.com/ecopages/ecopages/pull/805) [`3d2c2ae`](https://github.com/ecopages/ecopages/commit/3d2c2ae819af1f97af68c38a14a576d157a8d65a) Thanks [@andeeplus](https://github.com/andeeplus)! - Production builds no longer hash every page's dependencies a second time after building the shared page graph. Each app now keeps one build queue from config finalization onwards, so builds started while plugins and Integrations set up share in-flight results with the server's later builds, and the build entry no longer exports a way to replace that queue.

    The unused `experimental` config option is removed. Build adapters no longer declare an `ownership` field, and the request pipeline metrics report in-process route-module cache hits as `routeModuleCacheHits` instead of `diskCacheHits`.

- [#801](https://github.com/ecopages/ecopages/pull/801) [`7d1280e`](https://github.com/ecopages/ecopages/commit/7d1280ef02b176e304ed70c6e70e0bb4db1e1d46) Thanks [@andeeplus](https://github.com/andeeplus)! - **Breaking:** a query key repeated in the URL (`?tag=a&tag=b`) is now an array of its values in page, API and WebSocket handlers instead of its last value. A key that appears once stays a string. Schemas that expect a string answer HTTP 400 for repeated keys; accept both shapes with `z.union([z.string(), z.array(z.string())])`. WebSocket upgrade handlers now share the page and API query parser, and `search` on WebSocket sockets and `context()` input is typed like `PageQuery`.

- [#796](https://github.com/ecopages/ecopages/pull/796) [`a2817ae`](https://github.com/ecopages/ecopages/commit/a2817aeea7d817a2c1ca26494f4e98e8ae97db36) Thanks [@andeeplus](https://github.com/andeeplus)! - Restore the `EcoMiddleware` type export from `@ecopages/core`. It was importable from the package root in 0.2.0 but was dropped from the public types in 0.3.0, which broke the `import type { EcoMiddleware } from '@ecopages/core'` shown in the docs and starter skills. Several docs snippets that imported from the wrong entry point now point at the entry that exports the symbol.

- [#808](https://github.com/ecopages/ecopages/pull/808) [`093a31d`](https://github.com/ecopages/ecopages/commit/093a31d8ef94966682c0075b029b71806116a189) Thanks [@andeeplus](https://github.com/andeeplus)! - `RouteRendererFactory`, exported from `@ecopages/core/integration`, no longer takes a `runtime` option because it never read it. Construct it with `new RouteRendererFactory({ appConfig })`.

- [#782](https://github.com/ecopages/ecopages/pull/782) [`559d4ae`](https://github.com/ecopages/ecopages/commit/559d4aecde62fb90762394124755b8603807652b) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix `ecopages dev`, `build`, `start` and `preview` failing with `ERR_MODULE_NOT_FOUND` in 0.3.0: the published package was missing the module that serves built files.

- [#819](https://github.com/ecopages/ecopages/pull/819) [`ad66534`](https://github.com/ecopages/ecopages/commit/ad665347bffcef339e8eb4a405f136b249e7c58e) Thanks [@andeeplus](https://github.com/andeeplus)! - `ecopages start` now explains a static-only build. An app with no API or WebSocket handlers builds no server bundle, so `start` cannot run it; when `dist` (or the `--dist-dir` directory) holds built HTML, the command says so and points to `ecopages preview` or a static host instead of asking for another build. The static templates now start with `ecopages preview`, so `pnpm start` works in them.

- [#802](https://github.com/ecopages/ecopages/pull/802) [`08485ba`](https://github.com/ecopages/ecopages/commit/08485ba56bbf8d4c245b4cae4dc1329a7d214e21) Thanks [@andeeplus](https://github.com/andeeplus)! - Static export of explicit routes now writes the right file for every `staticPaths` entry. A catch-all such as `/docs/:...path` expands to its segments instead of writing every entry to one file, and a param whose name starts another param's name (`:id` and `:idx`) no longer corrupts the path.

- [#783](https://github.com/ecopages/ecopages/pull/783) [`87c0399`](https://github.com/ecopages/ecopages/commit/87c039971a4474e197eed65425a9b5477644efbe) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix app shutdown hanging or leaking a server. Stopping an app now completes while WebSocket clients are connected, so `ecopages dev` restarts after a config or `.env` edit even with a browser tab open. Calling `stop()` while `start()` is still running ends the startup, leaves nothing listening, and does not start the app again.

- [#798](https://github.com/ecopages/ecopages/pull/798) [`f2d71bc`](https://github.com/ecopages/ecopages/commit/f2d71bce7f02ba8103bb33700f336882dceb59e3) Thanks [@andeeplus](https://github.com/andeeplus)! - In development, deleting or renaming a file in the public directory now removes its copy from the served output, so the old file no longer keeps being served. An invalid `ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS` value (not a number, or negative) now logs a warning and uses the default 150 ms window instead of silently disabling debouncing.
- Updated dependencies [[`d7a5bee`](https://github.com/ecopages/ecopages/commit/d7a5bee78fc670398b50b5da215c5d91cdccddbd), [`0857ed4`](https://github.com/ecopages/ecopages/commit/0857ed44eb12f0cba2e47c257a56491ba3448021)]:
    - @ecopages/file-system@0.3.1
    - @ecopages/dev-toolbar@0.3.1

## 0.3.0

### Minor Changes

- [#697](https://github.com/ecopages/ecopages/pull/697) [`01a2e7f`](https://github.com/ecopages/ecopages/commit/01a2e7f415d0e7002d4e46ed823ca569bbec85e4) Thanks [@andeeplus](https://github.com/andeeplus)! - `createIntegrationRenderer()` supports a `finalizeDocument` hook for integration-owned reconciliation after core transforms the response. HTML Pages uses this hook to reconcile its Page head and root attributes for route responses.

- [#696](https://github.com/ecopages/ecopages/pull/696) [`ffb4dc3`](https://github.com/ecopages/ecopages/commit/ffb4dc39fb0d4d5121b2ad7a41c042d3feb3e717) Thanks [@andeeplus](https://github.com/andeeplus)! - Integration hook factories now receive `resolveDependencies()` so Page Browser Graph hooks can use core's dependency collection and asset processing.

    **Breaking:** MDX renderer instances no longer expose `compilerOptions`, and the public `MDXRendererConfig` and `MDXRendererOptions` type exports are removed. Configure compiler options on `mdxPlugin()`; they are consumed by the MDX build plugin.

    The standalone MDX renderer now uses core's shared route renderer and its page-module and dependency hooks.

- [#701](https://github.com/ecopages/ecopages/pull/701) [`a0e4687`](https://github.com/ecopages/ecopages/commit/a0e468747450384bb62f552b0e819aaf6e782a4d) Thanks [@andeeplus](https://github.com/andeeplus)! - ### Breaking Changes

    React-specific renderer behavior now runs through `IntegrationRendererHooks`. Custom `ReactRenderer` subclasses that supplied rendering behavior through renderer overrides should move it to the `hooks` option, using `renderComponent`, `collectPageBrowserGraphContribution`, `normalizePageModule`, `documentContributions`, `documentAttributes`, or `buildIslandClientAssets` as applicable. A React renderer's custom hooks override the built-in React hooks with matching names.

    React now supplies its page payload, document contributions, shell composition, and grouped island assets through the shared Integration renderer hooks. React routes now follow core's route-parameter precedence.

- [#744](https://github.com/ecopages/ecopages/pull/744) [`a16f0e1`](https://github.com/ecopages/ecopages/commit/a16f0e1dcbc4e42dcb2ddaa2ac44a48f9ce2aa43) Thanks [@andeeplus](https://github.com/andeeplus)! - **Breaking:** `AppRuntime.entrypointDependencyGraph` and `supportsSelectiveInvalidation()` are removed. The HMR manager now owns the dependency graph. Custom HMR contexts only need to expose `getDependencyEntrypoints()`; the manager records and clears dependency edges itself.

- [#476](https://github.com/ecopages/ecopages/pull/476) [`8e732e3`](https://github.com/ecopages/ecopages/commit/8e732e328ccba1b9595b9bd8cffce3bd88515a0a) Thanks [@andeeplus](https://github.com/andeeplus)! - Glob patterns in `additionalWatchPaths` now work in `ecopages dev`. A pattern such as `content/**/*.md` was never watched and never matched, so editing `content/blog/post.md` did not reload the page. Ecopages now watches the folder before the first wildcard (`content` here, or the project root for `**/*.config.ts`) and reloads only for files that match the pattern.

    Globs are anchored at the project root. `*.css` used to match any `.css` file and now matches only top-level files; write `**/*.css` to match at any depth. `*` and `**` skip names starting with a dot unless the pattern spells the dot, such as `.github/**/*.yml`. Only entries containing `*` are globs; to match a literal bracket inside a glob, write `[[]`.

    **Breaking:** A glob such as `*.css` no longer matches files in nested directories. Use `**/*.css` to include files at every depth.

- [#535](https://github.com/ecopages/ecopages/pull/535) [`3e5807e`](https://github.com/ecopages/ecopages/commit/3e5807e6c687cf3df90674b30c1a9bdbf3ce12a3) Thanks [@andeeplus](https://github.com/andeeplus)! - Island and lazy-entry browser modules for a Page are emitted together. Hydration scripts use the emitted URLs, so islands that import the same app module share one browser module instance.

- [#737](https://github.com/ecopages/ecopages/pull/737) [`830d848`](https://github.com/ecopages/ecopages/commit/830d84888431c7b56f020edfe1509698229bb6b8) Thanks [@andeeplus](https://github.com/andeeplus)! - **Breaking:** `AppRuntime.moduleLoader.importModule()` no longer accepts `rootDir` or `buildExecutor`; imports always use the finalized app configuration and its build queue.

- [#707](https://github.com/ecopages/ecopages/pull/707) [`45ea9a1`](https://github.com/ecopages/ecopages/commit/45ea9a1e4b8dfaf37c85de8ded58c41dbeb0609b) Thanks [@andeeplus](https://github.com/andeeplus)! - Assemble one app runtime when a config is finalized. A config that skipped finalization has no runtime.

    **Breaking:** `RouteRendererFactory` now requires `runtime`. Import `requireAppRuntime` from `@ecopages/core/config/app-runtime` and pass `requireAppRuntime(appConfig)`.

- [#543](https://github.com/ecopages/ecopages/pull/543) [`342eb0b`](https://github.com/ecopages/ecopages/commit/342eb0bc56df6d0c49af2dee2298dee848639e09) Thanks [@andeeplus](https://github.com/andeeplus)! - In development, routes listed in `devPrewarmPaths` and content collection `devPrewarm` render in the background. The server reports that it is listening without waiting for them, and Integration `setup()` now finishes before that message.

    When an app stops or a development server restarts, queued prewarm renders are skipped and any render in progress finishes first. Core then calls each Integration's `teardown()` and runs `setup()` again on the next start, so Lit workers no longer survive restarts. Integrations must keep `setup()` safe to run more than once.

    The content processor adds its collection pathnames to `devPrewarmPaths` in `setup()`, from the manifests it has just generated. An error reading a manifest there now fails startup, like any other `setup()` error, instead of being logged after the server is ready. Core renders the de-duplicated list in the background; a path that fails to render is skipped and logged at debug level.

    **Breaking:**

    - `devPrewarmBeforeReadyPaths` is removed; use `devPrewarmPaths`.
    - Content collection `devPrewarmReadiness` is removed; every declared path renders in the background.
    - `Processor.collectDevPrewarmPlan()` is removed. A Processor that owns pages to prewarm appends their pathnames to `this.context.config.devPrewarmPaths` from `setup()`; core renders that one list.

- [#504](https://github.com/ecopages/ecopages/pull/504) [`47f2b35`](https://github.com/ecopages/ecopages/commit/47f2b350e031f92c3afa4e134a807e5ccf6630b0) Thanks [@andeeplus](https://github.com/andeeplus)! - Builds call build plugin hooks only for modules they can match. The `onResolve` and `onLoad` filters of every build plugin, and the filters of source transforms, now reach the bundler as hook filters, so a module that no filter matches is resolved and loaded without calling into JavaScript.

    **Breaking:**

    - The bundler tests `onResolve` and `onLoad` filters against ids whose path separators are normalized to `/`, also on Windows. A filter that matches `\` separators no longer matches there; write `/` or `[\\/]`.
    - A build plugin must register its `onResolve`, `onLoad`, and `module` handlers before `setup` returns or its promise resolves. A later call throws, because the bundler reads hook filters before the build starts.

- [#653](https://github.com/ecopages/ecopages/pull/653) [`2937034`](https://github.com/ecopages/ecopages/commit/2937034542eda4ac6cb6055f992b0ecaeb786228) Thanks [@andeeplus](https://github.com/andeeplus)! - A failed build now throws one error that lists every log with its plugin, file, code frame and stack. The config bundle, the server entry, the unified pages graph, collection server modules, page module imports, the dev transform server, the HTML Page module scripts and page script bundles used to format failed logs in their own way, and some joined `log.message` and dropped the rest. Page script bundles used to hide a failed build behind a "No build output" error.

    **Breaking:** `build()` and `getTranspileOptions()` are removed from `@ecopages/core/build/build-adapter`, as is `getAppTranspileOptions()` and the `getTranspileOptions()` method of `BuildAdapter`. Run a build through the app's queue, `requireBuildQueue(appConfig).build(options)`, or call `buildOrThrow(appConfig, options, failure)` to get an error for a failed build. Browser defaults come from the request helpers.

- [#671](https://github.com/ecopages/ecopages/pull/671) [`caed6fe`](https://github.com/ecopages/ecopages/commit/caed6fea817ef0bebdd6ae9abb7b93f4ec7b94a7) Thanks [@andeeplus](https://github.com/andeeplus)! - `BuildResult` is a `BuildSuccess` or a `BuildFailure`. A successful build always has its outputs, warnings, loaded inputs, dependency graph, entry outputs and output graph, where they used to be optional, and a failed build has only its logs. Logs are `BuildLog`s rather than Rolldown's `RolldownLog`, and carry `message`, `code`, `plugin`, `hook`, `id`, `loc`, `frame` and `stack`.

    **Breaking:** code that reads `result.outputs` or `result.logs` without checking `result.success` first no longer type-checks, and a `BuildAdapter` or `BuildExecutor` of your own must return the new shapes. Rolldown's `binding`, `exporter`, `ids`, `meta`, `names`, `pluginCode`, `pos`, `reexporter`, `url` and `cause` are no longer copied onto a log.

- [#700](https://github.com/ecopages/ecopages/pull/700) [`d7c7b72`](https://github.com/ecopages/ecopages/commit/d7c7b721ff9e7961c302ac0019f31d643bb761fc) Thanks [@andeeplus](https://github.com/andeeplus)! - Add route lifecycle, per-render hook factories, and foreign-child normalization Integration hooks.

- [#529](https://github.com/ecopages/ecopages/pull/529) [`094a380`](https://github.com/ecopages/ecopages/commit/094a3805f1bf3ccb6d76e0de3831c7142ffe6b90) Thanks [@andeeplus](https://github.com/andeeplus)! - Build plugins can register source transforms through `EcoBuildPluginBuilder.transform`. The transform hook runs after a `load` plugin has supplied a module, so transformations still apply when a load plugin claims that file.

- [#722](https://github.com/ecopages/ecopages/pull/722) [`b6a980d`](https://github.com/ecopages/ecopages/commit/b6a980d41c5d9a2d672d6cee1600a0d55d74955e) Thanks [@andeeplus](https://github.com/andeeplus)! - Simplify the plugin lifecycle contract and move collection builds to the content processor.
  Static export also reconciles the Lit render worker with the export base URL when setup used a different runtime origin.

    **Breaking:**

    - Remove `Processor.collectDevPrewarmPaths()`; the content processor adds its collection paths to `appConfig.devPrewarmPaths` from `setup()`.
    - Remove `Processor.invalidateServerArtifacts()` and the core collection-build subpath. Collection module builds and cache invalidation now belong to `@ecopages/content-processor`.
    - Remove `prepareBuildContributions()`. Core reads pure `plugins(app)` once during finalization; processors and integrations create needed state in `setup()` or lazily in their build callbacks. The `buildContributionsPrepared` flags and Image processor Lit-worker guard are removed.
    - Replace Integration setters `setConfig()`, `setRuntimeOrigin()`, `setHmrManager()`, and `initializeAssetDefinitionService()`, plus `createRendererOptions()`, `attachRendererRuntimeServices()`, and `initializeRenderer()`, with `setup(ctx)` and `createRenderer(base)`. Replace `getHmrStrategy()` with `hmr(ctx)`. `browserRuntimeManifest` is constructor data.
    - Replace `beforeStaticExport()` with `staticExport(ctx)`, which may return a release function that core awaits after export.
    - Core calls Integration `teardown()` after static-export releases, including when route discovery or generation fails.
    - Replace the abstract Processor `process()` contract with optional `transformStylesheet(css, file)`. Replace PostCSS `matchesFileFilter()` with the capability `filter` field.
    - Remove the `sourceTransforms` app option and the `EcoSourceTransform`, `mergeSourceTransformPlugins()`, and `getAppSourceTransforms()` APIs. Use build plugins with `transform`; core's component identity transform is now an internal build plugin.

- [#601](https://github.com/ecopages/ecopages/pull/601) [`5ef3dfd`](https://github.com/ecopages/ecopages/commit/5ef3dfd5884b49fe36714822aa47b80b25770927) Thanks [@andeeplus](https://github.com/andeeplus)! - Build content collection server modules through the app's route-module build queue, and delete code only tests reached.

    Collection server builds now share the concurrency limit and in-flight deduplication of the app's other route-module builds instead of running on an unbounded standalone Rolldown adapter.

    **Breaking:** `@ecopages/core` removes the lazy `scripts-injector` wrapper that nothing emitted. The `ResolvedLazyScriptGroup` type and the `_resolvedLazyScripts` component config field are gone; lazy scripts load through the page-level injector map and each component's `data-eco-trigger` attribute, which is unchanged. Remove any reference to the type or the field.

    **Breaking (continued):** test-only members are gone from `@ecopages/core`. `AssetProcessingService` no longer has `clearCache()` or `getRegistry()` and `invalidateCacheForFile()` is private; the service already evicts assets when a build input changes. `PageCacheService` no longer has `generateCacheKey()`, `getDependencyIndex()` or `getStore()`. `ForeignSubtreeExecutionService` no longer has `createFailFastRuntime()`. `StaticSiteGenerator` no longer has `isRootDir()`. `@ecopages/core/diagnostics/request-pipeline-metrics` no longer exports `resetRequestPipelineMetrics`, `@ecopages/core/plugins/package-specifier` no longer exports `isSubpathOfPackageRoot`, and `@ecopages/core/route-renderer/page-loading/file-scoped-dependency-components` no longer exports `splitPageDependenciesResult`. A test that needs isolation should create a fresh app config or service per test instead of resetting shared state.

- [#641](https://github.com/ecopages/ecopages/pull/641) [`af9331a`](https://github.com/ecopages/ecopages/commit/af9331af8f4f8b8e398e72159bc6a117e98e6594) Thanks [@andeeplus](https://github.com/andeeplus)! - A build request is now identified by every build option except its plugins, so two requests that differ only in `runtimeOutdir` or `reportPackagesOutsideRoot` build separately instead of sharing one result. `EcoBuildPlugin` and `EcoSourceTransform` take an optional `cacheKey`. A factory that captures an option that changes its output sets it, as the `import.meta` transform does for its runtime directory, so plugins of one name built from different options stay apart. Plugins are identified by name, environments and `cacheKey`; the source of `setup` no longer is.

- [#721](https://github.com/ecopages/ecopages/pull/721) [`bad4aa8`](https://github.com/ecopages/ecopages/commit/bad4aa8afa086dfd4e3b3fce4ebc10f563c701d9) Thanks [@andeeplus](https://github.com/andeeplus)! - `createApp()` now returns the concrete `EcopagesApp`, which owns route registration and the Node HTTP server lifecycle. Command-line options are resolved once when the app is created. Concurrent startup and request-only calls share initialization, and `fetch()` after `stop()` initializes a fresh server adapter.

    ### Breaking Changes

    The exported `UniversalEcopagesApp` and `ResolvedEcopagesAppOptions` types have been removed. Use `EcopagesApp` and `EcopagesAppOptions` from `@ecopages/core/create-app`.

    The adapter internals `AbstractServerAdapter`, `ServerAdapterOptions`, `ServerAdapterResult`, and `NodeServerAdapterResult`, along with the `createAdapter()` facade, have been removed. Use `createApp()` for the supported application API. Custom `IHmrManager` implementations must implement `tryHandleDevClientRequest(request)` and return a response or `null`.

- [#747](https://github.com/ecopages/ecopages/pull/747) [`ac71172`](https://github.com/ecopages/ecopages/commit/ac71172a6b023740604add471a3828bb7debf072) Thanks [@andeeplus](https://github.com/andeeplus)! - Centralize asset processing state in `AssetProcessingService` and pass Integration ownership explicitly.

    **Breaking:** `AssetProcessingService.processDependencies()` now accepts the owning Integration object or `undefined` instead of a string processing key. Update callers to pass the Integration instance as the second argument, or pass `undefined` for app-wide processing.

- [#765](https://github.com/ecopages/ecopages/pull/765) [`a419298`](https://github.com/ecopages/ecopages/commit/a419298f811fa4402604aaa471587c43c03f6c94) Thanks [@andeeplus](https://github.com/andeeplus)! - **Breaking:** Core now publishes role-based entries only. Imports below must move to their listed entry. The source transform in `packages/codemod` rewrites imports whose requested names exist in the destination entry and reports unresolved names for manual migration. `@ecopages/codemod` is an internal workspace package and is not published to npm; see its README for how to run it from the Ecopages repository.

    - `@ecopages/core/assets/hashed-browser-asset` -> `@ecopages/core/processor`
    - `@ecopages/core/build/browser-runtime-manifest` -> `@ecopages/core/build`
    - `@ecopages/core/build/browser-runtime-plugin` -> `@ecopages/core/build`
    - `@ecopages/core/build/build-adapter` -> `@ecopages/core/build`
    - `@ecopages/core/build/build-queue` -> `@ecopages/core/build`
    - `@ecopages/core/build/contracts/content-virtual-modules` -> `@ecopages/core/build/contracts`
    - `@ecopages/core/build/contracts/server-only-specifier` -> `@ecopages/core/build/contracts`
    - `@ecopages/core/build/jsx-ownership-plugins` -> `@ecopages/core/build`
    - `@ecopages/core/build/lit-static-render-worker-context` -> `@ecopages/core/build`
    - `@ecopages/core/build/server-module` -> `@ecopages/core/build`
    - `@ecopages/core/cache` -> `@ecopages/core/build`
    - `@ecopages/core/client/navigation-scripts` -> `@ecopages/core/client`
    - `@ecopages/core/client/scroll` -> `@ecopages/core/client`
    - `@ecopages/core/client/view-transitions` -> `@ecopages/core/client`
    - `@ecopages/core/config/app-runtime` -> `@ecopages/core/integration`
    - `@ecopages/core/constants` -> `@ecopages/core/build`
    - `@ecopages/core/dev-toolbar/build-error-contract` -> `@ecopages/core/client`
    - `@ecopages/core/dev-toolbar/define-dev-tool` -> `@ecopages/core/client`
    - `@ecopages/core/dev-toolbar/dev-toolbar-manifest-contract` -> `@ecopages/core/client`
    - `@ecopages/core/dev/development-restart` -> `@ecopages/core/build`
    - `@ecopages/core/dev/transform-server` -> `@ecopages/core/integration`
    - `@ecopages/core/diagnostics/request-pipeline-metrics` -> `@ecopages/core/build`
    - `@ecopages/core/eco/page-layout-normalization` -> `@ecopages/core/client`
    - `@ecopages/core/hash` -> `@ecopages/core/build`
    - `@ecopages/core/hmr/hmr-entrypoint-output` -> `@ecopages/core/integration`
    - `@ecopages/core/hmr/hmr-registered-entrypoints-context` -> `@ecopages/core/integration`
    - `@ecopages/core/hmr/hmr-strategy` -> `@ecopages/core/integration`
    - `@ecopages/core/internal/finalize-config` -> `@ecopages/core/config`
    - `@ecopages/core/plugins/define-integration` -> `@ecopages/core/integration`
    - `@ecopages/core/plugins/integration-plugin` -> `@ecopages/core/integration`
    - `@ecopages/core/plugins/jsx-import-source.utils` -> `@ecopages/core/integration`
    - `@ecopages/core/plugins/package-specifier` -> `@ecopages/core/build`
    - `@ecopages/core/plugins/processor` -> `@ecopages/core/processor`
    - `@ecopages/core/plugins/tsconfig-import-resolver` -> `@ecopages/core/build`
    - `@ecopages/core/route-renderer/orchestration/custom-element-scripts/custom-element-script-preloader` -> `@ecopages/core/integration`
    - `@ecopages/core/route-renderer/orchestration/custom-element-scripts/custom-element-server-module-importer` -> `@ecopages/core/integration`
    - `@ecopages/core/route-renderer/orchestration/custom-element-scripts/custom-element-ssr-preload-entrypoint` -> `@ecopages/core/integration`
    - `@ecopages/core/route-renderer/orchestration/document-shell/document-shell-render.service` -> `@ecopages/core/integration`
    - `@ecopages/core/route-renderer/orchestration/document-shell/layout-shell-props.service` -> `@ecopages/core/integration`
    - `@ecopages/core/route-renderer/orchestration/foreign-child/component-render-context` -> `@ecopages/core/integration`
    - `@ecopages/core/route-renderer/orchestration/foreign-child/foreign-subtree-execution.service` -> `@ecopages/core/integration`
    - `@ecopages/core/route-renderer/orchestration/integration-renderer` -> `@ecopages/core/integration`
    - `@ecopages/core/route-renderer/orchestration/page-browser-graph/page-browser-graph-merge.utils` -> `@ecopages/core/integration`
    - `@ecopages/core/route-renderer/orchestration/string-markup-renderer` -> `@ecopages/core/integration`
    - `@ecopages/core/route-renderer/page-loading/file-scoped-dependency-components` -> `@ecopages/core/integration`
    - `@ecopages/core/route-renderer/route-renderer` -> `@ecopages/core/integration`
    - `@ecopages/core/router/link-intent` -> `@ecopages/core/client`
    - `@ecopages/core/router/link-navigation-policy` -> `@ecopages/core/client`
    - `@ecopages/core/router/navigation-coordinator` -> `@ecopages/core/client`
    - `@ecopages/core/router/navigation-lifecycle` -> `@ecopages/core/client`
    - `@ecopages/core/router/navigation-pipeline` -> `@ecopages/core/client`
    - `@ecopages/core/services/asset-processing-service` -> `@ecopages/core/integration`
    - `@ecopages/core/utils/path-containment` -> `@ecopages/core/build`
    - `@ecopages/core/utils/resolve-entry-file` -> `@ecopages/core/build`

- [#602](https://github.com/ecopages/ecopages/pull/602) [`9c3ecf5`](https://github.com/ecopages/ecopages/commit/9c3ecf571740c4e15e2c247c899daee18fdfa0ff) Thanks [@andeeplus](https://github.com/andeeplus)! - Production builds no longer carry the incremental build cache. Every build runs in a fresh process, so no cached output, fingerprint, or core version check could match; `ecopages build` already emptied `dist` and rendered every page from source. The build now says so in code: it empties `dist` without consulting a manifest, no longer writes or reads `.build-cache.json`, and the unified pages graph and route-module transpile cache stay in memory for the current process. `ECOPAGES_UNIFIED_PAGES_GRAPH=0` still turns the unified graph off; `=1` never changed anything and is no longer read.

    **Breaking:**

    - `StaticExportContext` no longer has `preserveExportDirectory`, which was always `false`. Integrations that read it in `staticExport` or `afterStaticExport` should drop the check.

- [#536](https://github.com/ecopages/ecopages/pull/536) [`5dd032d`](https://github.com/ecopages/ecopages/commit/5dd032d588338cca493b55b55b4612c362f5139a) Thanks [@andeeplus](https://github.com/andeeplus)! - Development file edits now share one debounce window. The watcher marks server modules, Page Browser Graphs, HTML cache entries, and route-module records dirty and notifies the browser once; unopened Pages rebuild on the next request.

- [#584](https://github.com/ecopages/ecopages/pull/584) [`78f326c`](https://github.com/ecopages/ecopages/commit/78f326cf944968772d9128b1769b30f10dc648d3) Thanks [@andeeplus](https://github.com/andeeplus)! - `ecopages start` runs the bundle that `ecopages build` wrote, whatever `distDir` the app sets, and the production server caches only content-hashed assets as `immutable`.

    **Breaking:** `ecopages start` no longer assumes `dist`. It runs the only directory one level below the project root that holds `.server/manifest.json` (dot-prefixed directories count; symlinked and nested outputs such as `out/web` do not), fails with the candidates listed when several exist, and fails with "run `ecopages build`" when none does. Pass `--dist-dir <dir>` to choose one, which an app that builds several outputs, such as `dist-<scope>`, has to do. A server bundle without a manifest is no longer started, and `resolveProductionServerEntry`, `assertProductionConfigIdentity` and `resolveEmittedEcoConfigPath` from `@ecopages/core/config` now require the `distDir` instead of defaulting to `dist`. Rebuild with `ecopages build` after upgrading.

    **Breaking:** Static files are no longer marked `immutable` because their name looks hashed. Only outputs that the build recorded as content-hashed are, which now includes Rolldown chunks whose hash contains `-`; exported `.html` pages and every other file, such as `public` files, are revalidated with an `ETag`. `isContentHashedAssetFilename` is removed from `@ecopages/core/assets/hashed-browser-asset`; there is no filename-based replacement, because a name cannot tell a content hash from a word.

    **Breaking:** The runtime file server and the Node preview share one response policy. Both answer `If-None-Match` with `304`, gzip responses included, and both send a gzip variant only to a client whose `Accept-Encoding` allows it, with `Vary: Accept-Encoding`; the runtime server used to send it unconditionally. In `ecopages dev`, static non-HTML files are sent with `Cache-Control: no-cache`.

    **Breaking:** The page cache stays off in `ecopages dev` unless `cache.enabled: true` is set, as `CacheConfig.enabled` documents. It was on by default in watch mode. Set `cache.enabled: true` to keep the old behavior.

    Dev vendor bundles are built in memory on the first request of each dev process and are no longer written under `dist/assets/vendors` or reused from an earlier process, so a transitive dependency update or a Core upgrade is picked up by restarting `ecopages dev`. The caching guide now lists the `static` page-cache strategy as `public, max-age=0, must-revalidate`, which is what it always sent.

- [#780](https://github.com/ecopages/ecopages/pull/780) [`30f0640`](https://github.com/ecopages/ecopages/commit/30f0640d1cfe62171bef49a2fd7573ba8fa535c7) Thanks [@andeeplus](https://github.com/andeeplus)! - Add `ecopages types`. It loads `eco.config.ts` (or `--config`), which makes processors write the types for virtual modules such as `ecopages:images` and `ecopages:content/*`, then exits; the app entry does not run. Run it before `tsc` on a fresh checkout or in CI, where those types do not exist yet: `"typecheck": "ecopages types && tsc --noEmit"`. The official templates now ship that script.

- [#609](https://github.com/ecopages/ecopages/pull/609) [`4f6b4e9`](https://github.com/ecopages/ecopages/commit/4f6b4e9a82432e3c842d3dbecf2a0a58213d5b0c) Thanks [@andeeplus](https://github.com/andeeplus)! - A full explicit view renders through the same route pipeline as a filesystem Page.

    **Breaking:** `renderToResponse` is removed. `ctx.render`, `ctx.renderServerModule`, explicit static routes, static export, and registered error pages call `renderExplicitView`, which runs a full view through the route pipeline. A full view receives every layout, default metadata, robots meta, and its own page client plan. The props passed to the render are the view's final props: they are available to its `metadata`, and the render does not run the view's `staticProps` (explicit static routes and static export run it once, with the route's params, before rendering). `ctx.render`, `ctx.renderServerModule` and `ctx.renderPartial` forward the handler's request locals, route params and query, so a view can read them and its `metadata` receives the params. Static export reuses the metadata of the render for the sitemap instead of calling `metadata` again. A partial render stays on the component path. Static export planning resolves the renderer without calling `staticProps`.

    Island entries are components whose Integration differs from their parent's. The Html shell is not an island.

- [#691](https://github.com/ecopages/ecopages/pull/691) [`fee1c6d`](https://github.com/ecopages/ecopages/commit/fee1c6d03e3816ff5b83d6348f3611393325d3a7) Thanks [@andeeplus](https://github.com/andeeplus)! - Source transforms are build plugins. The `sourceTransforms` config option, `EcoSourceTransform` and the `@ecopages/core/plugins/source-transform` entrypoint are gone; a transform is an `EcoBuildPlugin` that registers `build.transform({ filter }, callback)`. Component identity attribution and the `import.meta` rewrite are core's own plugins, added to every build request after all contributed plugins.

    **Breaking:**

    - Remove `sourceTransforms` from `defineConfig()`. Rewrite each entry as a plugin and register it in `loaders`: `{ name, setup(build) { build.transform({ filter }, (code, id) => ...) } }`. The callback returns the rewritten source, `{ code, map? }` or `undefined`, as before, but receives the module id with any query or hash still attached.
    - `enforce: 'pre' | 'post'` is gone. Transforms run in plugin order: loaders, then processors, then integrations, in the order each declares them. Core's own transforms run after all of them, so a user transform can no longer run after component identity attribution; one that used `enforce: 'pre'` or the default keeps its place before it.
    - `EcoSourceTransform`, `EcoSourceTransformResult`, `createEcoComponentMetaTransform` and `EcoPagesAppConfig.sourceTransforms` are removed from `@ecopages/core`.

- [#705](https://github.com/ecopages/ecopages/pull/705) [`4ddc338`](https://github.com/ecopages/ecopages/commit/4ddc338513a03f076ba3705cfa83813ea74d4b9d) Thanks [@andeeplus](https://github.com/andeeplus)! - Path invalidation now clears every query and development runtime variant for a pathname.

    **Breaking:** Custom `CacheStore` implementations must return keys evicted by `set()` and keys removed by `invalidateByTags()` and `invalidateByPaths()`, instead of returning nothing or a count. Return every removed key, or an empty array when none were removed, so the page cache can keep its dependency tracking in sync.

- [#699](https://github.com/ecopages/ecopages/pull/699) [`09d8c85`](https://github.com/ecopages/ecopages/commit/09d8c85c73877b010cf5626133cff8ec756dc703) Thanks [@andeeplus](https://github.com/andeeplus)! - Add component dependency and path resolution helpers to Integration renderer hooks; migrate Lit rendering to the hook factory.

- [#780](https://github.com/ecopages/ecopages/pull/780) [`a055062`](https://github.com/ecopages/ecopages/commit/a0550627a2ed1cf0a8020f9bc2fb1f33f780410f) Thanks [@andeeplus](https://github.com/andeeplus)! - An HTML Page `<script src>` without `type="module"` is compiled on its own as a classic script, whether it is JavaScript or TypeScript: types are stripped, `this` stays the global object, its top-level functions stay global, and in production it is minified without renaming them. Any `tsconfig.json` is ignored, so the output depends on the file alone. A classic script that is JSX (`.jsx` or `.tsx`), uses `import`, `export`, `import.meta` or `import x = require()`, imports a relative file with `import()`, has a top-level `await`, or needs a compile helper such as one for a decorator is an error asking for `type="module"`, instead of failing in the browser.

    Script assets accept `classic: true`, which compiles the file as a classic script instead of bundling it. HTML Pages set it for these classic scripts.

- [#780](https://github.com/ecopages/ecopages/pull/780) [`e702d0e`](https://github.com/ecopages/ecopages/commit/e702d0ebd02396706355531fd275e6b4cf8b4dab) Thanks [@andeeplus](https://github.com/andeeplus)! - HTML Pages derive their social tags: a Page that sets a `<title>` or description gets matching `og:title`, `og:description`, `twitter:title`, and `twitter:description` tags, which replace the shell's tags in place or are added to `<head>`. A tag the Page writes itself wins, whether it uses `name` or `property`, and a shell tag written either way is replaced in place.

- [#780](https://github.com/ecopages/ecopages/pull/780) [`57933f0`](https://github.com/ecopages/ecopages/commit/57933f0b58f5b6a454584cc61df6c5cff4ebbfc0) Thanks [@andeeplus](https://github.com/andeeplus)! - Add HTML Pages: a plain `.html` file under `src/pages/` is a Filesystem Route that needs no Integration or option in your config. A Page can be a body fragment, a `<head>` plus body markup, or a complete document; without a `<head>`, its leading `<title>`, `<meta>`, `<link>` and similar tags form the head, as in a browser. It renders inside the app's `src/includes/html.*`, which can now also be plain HTML (`html.html` with one `<!-- eco:children -->` marker), or a built-in shell when there is none. Page `<title>`, `<base>`, canonical, and keyed `<meta>` tags replace the shell's in place, `<html>` and `<body>` attributes merge, and local stylesheets, `<style>` blocks, and scripts are processed and emitted where they were written; the module scripts of all Pages and the shell are built together, so a module they share runs once, also across browser-router navigations. A stylesheet must be linked with `<link rel="stylesheet">`: a module script that imports one, as in `import './styles.css'`, makes its Page fail to render with an error naming the HTML file and the stylesheet. A `<link rel="preload">` or `<link rel="modulepreload">` for a stylesheet or script the Page or its shell processes points at its output, and an inline `<script type="module">` that imports a relative path is an error naming the HTML file. `404.html` and `500.html` work as error pages, and Page head tags feed page metadata and the Sitemap.

    **Breaking:**

    - Every app now routes `.html` files under `src/pages/`, which core previously ignored. An existing `.html` file there becomes a Page; move it out of `src/pages/` (to `src/public/` to serve it as written).
    - Route discovery fails when two Page files produce the same route, such as `about.tsx` next to `about/index.tsx`, instead of letting discovery order pick one. Delete or rename one of the files. Dynamic `.html` filenames such as `[slug].html` are also rejected.
    - `.html` now counts for semantic templates, so `src/includes/html.html` next to `html.tsx`, or `src/pages/404.html` next to `404.tsx`, fails with "Multiple … templates found". Keep one of each.

    For integration and processor authors: a file script asset with `bundle: false` is now copied as written in development too, matching production, instead of being built by the HMR entrypoint server. Content stylesheet assets accept `processingOrigin`, the path processors receive for inline CSS.

- [#780](https://github.com/ecopages/ecopages/pull/780) [`d252a24`](https://github.com/ecopages/ecopages/commit/d252a24b2c7003d305bfeae09181e6f5ee0b6657) Thanks [@andeeplus](https://github.com/andeeplus)! - Integrations can compile their own Page files and opt out of Params. `IntegrationPlugin.compilePageModule(filePath, appConfig)` returns a Page module, or a promise of one, for every file of the Integration that core loads, without the bundler, and an Integration that overrides `acceptsParams` with `false` makes route discovery reject the `[param]` and `[...param]` filenames it owns. A user Integration that registers a longer extension than `.html`, such as `.page.html`, keeps its own files.

    Core now matches a file to its Integration and its route path by the longest registered extension the file name ends with:

    - A static export includes Pages whose file name contains a dot, such as `release.notes.tsx` (route `/release.notes`). Before, rendering them failed with "No integration plugin found". The dev server does not serve these routes yet.
    - `about.kita.tsx` gets the route `/about` in any Integration order, and `notes.mdx` no longer becomes `/notesx` when `.md` is registered before `.mdx`.
    - A `.kita.tsx` or `.lit.tsx` Page whose Integration is not registered now renders with the Integration that owns `.tsx`, at a dotted route such as `/about.kita`, instead of failing with "No integration plugin found". Like other dotted routes, the dev server does not serve it yet.
    - A project inside a directory with brackets in its name, such as `/work/[client]/site`, no longer has every route treated as dynamic.

- [#478](https://github.com/ecopages/ecopages/pull/478) [`e749563`](https://github.com/ecopages/ecopages/commit/e749563892ca1b3c9a7cce6b968a35e0fe895fd0) Thanks [@andeeplus](https://github.com/andeeplus)! - Mark a component as an island only when it ships its own client script, excluding the scripts of Foreign Children (components of another integration nested inside it, whether declared in `dependencies.components` or rendered inside it). A Lit, Ecopages JSX, KitaJS, MDX or HTML component without scripts that wraps an island of another integration no longer gets `data-eco-component-id` or `data-eco-island-integration` on its root. The Page still receives every script.

    **Breaking:** `finalizeIslandComponentRender()` takes a required third argument. Custom integrations must pass the component's own assets, excluding those of Foreign Children, separately from the merged `assets` of the render result.

- [#615](https://github.com/ecopages/ecopages/pull/615) [`0a2c938`](https://github.com/ecopages/ecopages/commit/0a2c938528e09f0d4980646fedd40c1058a4d067) Thanks [@andeeplus](https://github.com/andeeplus)! - Browser-router always morphs the incoming body so persisted nodes stay connected and keep their scroll and lifecycle state when their ancestor structure remains compatible, including when View Transitions are disabled or rerun scripts are present. Rerun scripts refresh matching non-persisted nodes so event handlers do not stack. This is a breaking change: the core navigation-pipeline result no longer exposes a body-swap strategy, and the public browser-router `DomSwapper` no longer has a replacement method. Custom runtimes must choose their own body-swap behavior, and browser-router users should use `morphBody`.

- [#714](https://github.com/ecopages/ecopages/pull/714) [`71b5426`](https://github.com/ecopages/ecopages/commit/71b5426c5e818f68a1335efd632df3e239419682) Thanks [@andeeplus](https://github.com/andeeplus)! - Static production export builds page scripts, React island hydration entries, lazy entries, and HTML shell module scripts in compatible app-wide browser build groups. Entries in a group can share browser chunks when code splitting is enabled. Entry-specific plugins can join a group with a `bundleGroupKey` while keeping their per-entry configuration.

- [#572](https://github.com/ecopages/ecopages/pull/572) [`4ff37bf`](https://github.com/ecopages/ecopages/commit/4ff37bf7f15afef272367656d5badbdda3307327) Thanks [@andeeplus](https://github.com/andeeplus)! - **Breaking:** `ProcessorWatchConfig` replaces `onCreate`, `onChange`, and `onDelete` with one `onChanges` callback. This lets processors rebuild once for a debounce batch instead of once per file. Migrate by implementing `onChanges({ created, changed, deleted, bridge })`; each path array contains the absolute paths for that event kind. The type `ProcessorWatchContext` is replaced by `ProcessorWatchChanges`. Watch extensions still select notifications, and capabilities still declare asset ownership.

- [#614](https://github.com/ecopages/ecopages/pull/614) [`4abe50a`](https://github.com/ecopages/ecopages/commit/4abe50a1fb6511f15cfb980742ce6fc366c457c1) Thanks [@andeeplus](https://github.com/andeeplus)! - Dispatch every HMR-eligible file in a save batch through one call, so strategies can preserve client state when the changes support it. A batch hot-updates every island it touches instead of reloading, and an edit to an include file or an explicit view now refreshes the page in place when the navigation runtime is available instead of reloading it. A file that fails to process no longer drops the rest of its batch.

    **Breaking:** `HmrManager.handleFileChanges(paths, options)` is now required. A custom HMR manager must implement it; the watcher no longer falls back to calling `handleFileChange` once per file.

- [#730](https://github.com/ecopages/ecopages/pull/730) [`b84c5b9`](https://github.com/ecopages/ecopages/commit/b84c5b930f36067a4af6f3d0eb71230443aa502b) Thanks [@andeeplus](https://github.com/andeeplus)! - **Breaking:** A declared API body schema now validates `undefined` when the request has no body and no `Content-Type`, or when a supported JSON or plain text body is empty. Required schemas answer HTTP 400; mark a schema optional, such as with `.optional()`, when the route accepts a missing body. Unsupported content types and nonempty bodies without a `Content-Type` answer HTTP 415.

- [#710](https://github.com/ecopages/ecopages/pull/710) [`5aea490`](https://github.com/ecopages/ecopages/commit/5aea490205077855b55bb8fdaf2945ff8adc433c) Thanks [@andeeplus](https://github.com/andeeplus)! - Move build-side per-app state (build adapter, sealed build manifest, build queue, build-input dependency index, unified pages graph manifest, route-module build caches, and collection server build artifacts) onto `AppRuntime`, and remove fallback adapter and manifest creation when a config has not been assembled.

    **Breaking:** `getAppBuildOwnership`, `getAppBuildAdapter`, `setAppBuildAdapter`, `getAppBuildManifest`, and `setAppBuildManifest` are removed from `@ecopages/core/build/build-adapter`, and `getBuildQueue` is removed from `@ecopages/core/build/build-queue`. Read `buildAdapter`, `buildManifest`, and `buildQueue` from `requireAppRuntime(appConfig)` (or `requireBuildQueue(appConfig)`), and pass a finalized `EcoPagesAppConfig` to build services.

- [#711](https://github.com/ecopages/ecopages/pull/711) [`f4fdb10`](https://github.com/ecopages/ecopages/commit/f4fdb102f269375d352be0c4e751b07238399863) Thanks [@andeeplus](https://github.com/andeeplus)! - Move render and development per-app state (Page Browser Graph session, page cache, server invalidation state, entrypoint dependency graph, module loader, integration activation map, runtime asset preparation state, HTML Page module-script state, and registered script entrypoint change handlers) onto `AppRuntime`, delete the remaining per-config `WeakMap`/`WeakSet` stores and `getApp*`/`setApp*`/`registerApp*` accessors, and remove `runtime` from `EcoPagesAppConfig`.

    **Breaking:** `EcoPagesAppConfig.runtime` is removed. Read and update per-app runtime state through `requireAppRuntime(appConfig)` from `@ecopages/core/config/app-runtime`, and pass a finalized `EcoPagesAppConfig` to core render, cache, and development services.

- [#586](https://github.com/ecopages/ecopages/pull/586) [`f88f71a`](https://github.com/ecopages/ecopages/commit/f88f71a597dfb825ebea89e1bf9d8c02f98440da) Thanks [@andeeplus](https://github.com/andeeplus)! - Unify browser and React navigation through core's shared commit pipeline and fix toolbar navigation-owner telemetry.

    **Breaking:** `@ecopages/browser-router` no longer exports `ViewTransitionManager`; import `runNavigationViewTransition` from `@ecopages/core/router/navigation-pipeline` or use `commitNavigationPage`. `@ecopages/react-router` no longer exports `morphHead`; use `commitNavigationPage` with the React render as its `swap` callback, or `prepareNavigationHead` when staged head work is needed. In `@ecopages/core`, `dispatchAfterSwap` and `schedulePageLoad` are no longer exported; use `completeNavigationLifecycle` to emit both post-swap events. `documentHasNamedViewTransitions` is now private; use `navigationHasNamedViewTransitions`. The script barrel no longer re-exports low-level rerun queue and registry operations; use the navigation pipeline's script activation APIs. These operations are owned by the shared pipeline so custom runtimes should use `@ecopages/core/router/navigation-pipeline` for document commits and listen to lifecycle events rather than dispatching or scheduling individual signals.

    **Breaking (continued):** `@ecopages/browser-router`'s `DomSwapper` no longer has `morphHead`, `preloadStylesheets` or `flushScripts`; head work and script activation belong to the shared pipeline. `PrefetchOptions` requires `reloadAttribute`. `@ecopages/core/router/link-navigation-policy` no longer exports `assertHtmlPageResponse`: navigation accepts only `text/html` and `application/xhtml+xml` responses, so a server or test harness must send one of those types. Head reconciliation is now the same for both routers: after a navigation, head elements that the incoming page lacks are removed unless they carry the persist attribute, so elements injected into the head at runtime should carry it. The React router also activates head scripts that the incoming page adds.

- [#574](https://github.com/ecopages/ecopages/pull/574) [`8abf88a`](https://github.com/ecopages/ecopages/commit/8abf88a25e3b8ca1a24f36864cc9ac7b1f980f33) Thanks [@andeeplus](https://github.com/andeeplus)! - File system calls and content hashes use the Node implementation on every runtime. A path now has one component id on Node and on Bun.

    **Breaking:**

    - `BunFileSystem`, `bunFs`, and the `@ecopages/file-system/bun` export are removed. `fileSystem` is `NodeFileSystem`.
    - `rapidhash` no longer calls `Bun.hash`. It uses the SHA-256 prefix on every runtime, so ids generated on Bun change.

- Core owns the shared Integration render pipeline and exposes optional renderer hooks.

    ### Breaking Changes

    `RouteRenderOrchestratorAdapter` and `IntegrationRenderer.createRouteRenderOrchestratorAdapter()` are removed. The route orchestrator calls the Integration renderer directly; HTML Pages now use `finalizeDocument()` for post-transform head reconciliation. `ForeignSubtreeExecutionService` and `ForeignSubtreeRenderPayload` are removed. Import `createQueuedRuntime()`, `executeComponentRender()`, `resolveQueuedHtml()`, and `resolveQueuedTokens()` from the foreign-child execution module, and pass `ComponentRenderResult` directly.

    To configure renderer behavior without a subclass, use `createIntegrationRenderer()` and map the former extension points to hooks: `renderComponent`, `composeChildren`, `normalizePageModule`, `collectPageBrowserGraphContribution`, `documentContributions`, `documentAttributes`, `buildIslandClientAssets`, `beforeRender`, and `transformDocumentHtml`. A custom queued renderer can also provide `renderQueuedChildren`.

    Components whose `config.integration` override differs from their file identity now render and hydrate under that override consistently.

- [#647](https://github.com/ecopages/ecopages/pull/647) [`e65a3b3`](https://github.com/ecopages/ecopages/commit/e65a3b34a6d33c453d924e0a0d2114f4f6d30e2d) Thanks [@andeeplus](https://github.com/andeeplus)! - Every build the app's own build pipeline runs goes through one queue with three lanes: `build` (all cores but one), `hmr` (at most three) and `nested` (for a build that a running build waits for, such as a content collection bundle requested from a plugin hook, so it cannot wait for a slot its parent holds). A build the app does not own, such as the React hydration script compiler's, and a page module import with no app config, stay outside it. A build identical to one that is queued or running is shared, and so is a finished one within the same request, so the per-request build cache and the separate in-flight wrapper are gone. Server-entry builds use the `build` lane instead of running alone.

    **Breaking:** `@ecopages/core/build/build-runtime` is now `@ecopages/core/build/build-queue`. `installBuildRuntime` and `requireBuildRuntime` become `installBuildQueue` and `requireBuildQueue`, `appConfig.runtime.buildRuntime` becomes `appConfig.runtime.buildQueue`, `getProfile(...)` is replaced by `buildQueue.build(options, 'build' | 'hmr' | 'nested')`, and `disposeAppBuildRuntime` is removed because the queue holds nothing to release. `BrowserBundleOptions.executor` is removed; the lane follows the bundle's `profile`.

- [#655](https://github.com/ecopages/ecopages/pull/655) [`77895ca`](https://github.com/ecopages/ecopages/commit/77895cafb53c09afd8cbf710d3f8301d563dac28) Thanks [@andeeplus](https://github.com/andeeplus)! - The HMR client and the Dev Toolbar client now share one bundling, serving and HTML injection mechanism, and the server adapter asks the HMR manager whether to load them instead of reading the watch option itself.

    **Breaking:** `IHmrManager` has a new required method, `injectDevClientRuntimes(response)`. A custom manager must implement it: return the HTML response with a `<script type="module">import '<url>';</script>` for each client runtime that was built added before `</html>`, and return the response unchanged while `isEnabled()` is false. The server adapter injects dev client runtimes only when `isEnabled()` is true, so a manager that reports disabled receives no injection calls. Managers extending the core `SharedHmrManager` need no change.

    The Dev Toolbar now loads only while HMR is enabled. When the HMR runtime fails to bundle, the Node runtime disables HMR for the session and the Dev Toolbar is no longer loaded either, where before the page kept the toolbar. A toolbar that cannot be bundled still leaves HMR on.

- [#685](https://github.com/ecopages/ecopages/pull/685) [`e35d1f0`](https://github.com/ecopages/ecopages/commit/e35d1f066fea947cc58412f6e3c1b3b1a8b2da1d) Thanks [@andeeplus](https://github.com/andeeplus)! - One rule names the Integration that owns a Component: the `integration` override on its config, then the Integration of the file that created it, then its parent's. It is the new `getComponentOwner(component, inheritedOwner?)` export, and render routing, the component graph walk, the page client plan, dependency collection, the explicit view lookup, custom-element script preloading and the React renderer all use it.

    **Breaking:** `composeDocumentShell` and `renderPageDocumentShell` take the `integrationName` of the Integration rendering the shell. A shell component that names no owner reports that Integration instead of `'ecopages'`.

- [#688](https://github.com/ecopages/ecopages/pull/688) [`e870f8c`](https://github.com/ecopages/ecopages/commit/e870f8c68c0ec6c7d04596220367b3a5bc961f2d) Thanks [@andeeplus](https://github.com/andeeplus)! - Plugins and Processors have one build phase. Core reads each `plugins(app)` once while finalizing the config and runs nothing else of a Processor there, so a Processor whose `setup()` fails no longer fails config loading, and collection generation, image syncing and PostCSS config loading no longer run during finalization.

    The content processor generates its collection modules in `setup()`, and a build that resolves a collection before then waits for the same generation. PostCSS loads its plugin list on the first stylesheet transform. `ecopages build` and `ecopages preview` now empty `dist/` and set Processors up before the router reads any Page, so a dynamic Page's `getStaticPaths()` can read what a Processor generates in `setup()`. The image processor restores and optimizes images in `setup()` and no longer has a Lit worker guard, because core already skips Processor setup in the Lit worker.

    **Breaking:**

    - `Processor.prepareBuildContributions()` and `IntegrationPlugin.prepareBuildContributions()` are gone. Move the work that reads or writes files into `setup()`, and the plugin list into `plugins(app)`. When a build can run before `setup()`, start the work from the plugin's own callback and share one promise between callers.
    - `plugins` is a method, `plugins(app: EcoPagesAppConfig): EcoBuildPlugin[]`, on `Processor` and `IntegrationPlugin`, no longer a getter or a field. Change `get plugins() { return [...] }` and `plugins = [...]` to `override plugins(app) { return [...] }`. It must not do I/O, and `Processor` no longer requires subclasses to declare it: the default returns no plugins.
    - `ecopages types` now sets the Processors up, because they write their virtual-module types in `setup()`. Image optimization and the first PostCSS pass run as part of it.
    - `PostCssProcessorPlugin.processSync()` is gone. It had no callers and ran no PostCSS plugin until a `transformStylesheet()` call had loaded them; use `transformStylesheet()`.
    - `sealAppBuildManifest()` is synchronous.

- [#681](https://github.com/ecopages/ecopages/pull/681) [`0a925b0`](https://github.com/ecopages/ecopages/commit/0a925b0255c714218af27fa60aaefd0bc5f178a4) Thanks [@andeeplus](https://github.com/andeeplus)! - Every render of an Integration uses one renderer: routes, handler renders and foreign children of other Integrations. A handler that calls `ctx.render`, `ctx.renderPartial` or `ctx.renderServerModule` no longer builds a renderer, its services and its runtime module lookups on each request.

    **Breaking:** `IntegrationPlugin.initializeRenderer()` is called when the Integration has no renderer yet, and again after its app config, runtime origin or HMR manager changes, not once per render. `IntegrationPlugin.setConfig()` with the config the Integration already has changes nothing; core reaches the renderer through the new `IntegrationPlugin.getRenderer()`. A custom Integration whose renderer keeps per-render fields must move that state into the render, because renders now share the instance and overlap.

- [#711](https://github.com/ecopages/ecopages/pull/711) [`f4fdb10`](https://github.com/ecopages/ecopages/commit/f4fdb102f269375d352be0c4e751b07238399863) Thanks [@andeeplus](https://github.com/andeeplus)! - Read runtime `origin` and `hmr` directly from `AppRuntime`, remove `RouteRendererFactory.setRuntimeOrigin()`, `IntegrationPlugin.setRuntimeOrigin()`, and mutable `runtimeOrigin` copies across adapters, route renderers, and integrations, and register script-entrypoint change handlers on the per-session HMR manager (`IHmrManager.onScriptEntrypointChanged`) instead of `AppRuntime`.

    **Breaking:** `IntegrationPlugin.setRuntimeOrigin()`, `IntegrationPlugin.runtimeOrigin`, `RouteRendererFactory.setRuntimeOrigin()`, `RouteRendererFactory.runtimeOrigin`, `IntegrationRendererOptions.runtimeOrigin`, the `runtimeOrigin` constructor option on `RouteRendererFactory`, `ServerAdapterOptions`, `NodeServerAdapterParams`, and `ServerStaticBuilderParams`, and `AppRuntime.registeredScriptEntrypointChangeHandlers` are removed. Read and update the active origin through `requireAppRuntime(appConfig).origin`, read the active HMR manager from `requireAppRuntime(appConfig).hmr`, and register script-entrypoint change handlers via `hmrManager.onScriptEntrypointChanged(handler)`.

- [#693](https://github.com/ecopages/ecopages/pull/693) [`718bbfe`](https://github.com/ecopages/ecopages/commit/718bbfeafc24d7532328ff0fc36bdf838afe4d8f) Thanks [@andeeplus](https://github.com/andeeplus)! - ### Breaking Changes

    `HtmlTransformerService` no longer stores queued dependencies. Subclasses that used `setProcessedDependencies()`, `setPagePackage()`, `getProcessedDependencies()`, or `getPagePackage()` must keep render state themselves and pass it to `transform(response, { pagePackage, contributions })`. Replace `transformHtml(html, contributions, pagePackage)` calls with `injectPageAssets(html, { pagePackage, contributions })`. The second argument to `transform()` is now a `PageAssetInjection` object instead of the contributions array.

    Pages of one integration can render at the same time because each render keeps its own async context, assets, and foreign-renderer cache.

    Route params and query remain authoritative over extra page props. Disabling Page Browser Graph caching for one render also bypasses both cached records and in-flight graph builds.

    Page-owned stylesheet and module-script bundles preserve declaration order around files that use custom attributes.

    Each Integration now lazily owns one renderer shared by route renders, explicit views, and foreign-child handoffs.

    Static export uses the metadata returned by each rendered route for sitemap eligibility instead of loading the page again.

- [#689](https://github.com/ecopages/ecopages/pull/689) [`e2b207c`](https://github.com/ecopages/ecopages/commit/e2b207c55ac975757ef1873dc2b096890f9898fc) Thanks [@andeeplus](https://github.com/andeeplus)! - Core no longer tells Processors to drop compiled server artifacts. The content processor compares the app module loader's development generation with the one its compiled collection bundle was built at, and rebuilds the bundle on the next request after any server source edit, such as a component an entry imports.

    **Breaking:**

    - `Processor.invalidateServerArtifacts()` is gone, and `DevelopmentInvalidationService.invalidateServerModules()` no longer calls it. A Processor that keeps compiled server output outside the route-module graph reads `appConfig.runtime.appModuleLoader.getDevelopmentGeneration()`, which advances on every server source edit, and rebuilds when it differs from the generation the output was built at.

- [#676](https://github.com/ecopages/ecopages/pull/676) [`cf63e63`](https://github.com/ecopages/ecopages/commit/cf63e63f98ea8bbc2f98a1eed7f02b6ecee3798c) Thanks [@andeeplus](https://github.com/andeeplus)! - Processors transform stylesheets through an optional `transformStylesheet(css, file)` method instead of the abstract `process()`, which core only ever called for stylesheets.

    **Breaking:**

    - `Processor.process()` is gone and a subclass no longer has to implement it. Delete the override. A Processor that transformed stylesheets in `process(input, filePath)` implements `transformStylesheet(css, file): Promise<string>` instead; both arguments are strings and the result is the new stylesheet.
    - A Processor takes part in stylesheet processing only when it has `transformStylesheet()` and declares a `stylesheet` capability that matches the file. Core no longer runs a Processor without capabilities because its name contains `postcss`; add `capabilities: [{ kind: 'stylesheet' }]`.
    - `PostCssProcessorPlugin.process()` is now `transformStylesheet()`, and its file path argument is required.
    - `ContentProcessorPlugin.process()` is gone. Core never called it; the watch callbacks keep their own behaviour.

- [#720](https://github.com/ecopages/ecopages/pull/720) [`c28450d`](https://github.com/ecopages/ecopages/commit/c28450d76af8de1bf0a000f00acb5cdf970d3d0d) Thanks [@andeeplus](https://github.com/andeeplus)! - **Breaking:** Direct users of `@ecopages/core/diagnostics/request-pipeline-metrics` and the custom-element SSR preloader must pass the owning app runtime's state. Direct users of `@ecopages/mdx/core` and `@ecopages/mdx/mdx-loader-plugin` must pass `requestPipelineMetrics` when creating the MDX loader; obtain it from `requireAppRuntime(appConfig).requestPipelineMetrics`.

    Keep HTML Page warning state, custom-element SSR preload scopes, and request pipeline metrics on each app runtime. A config module can export `defineConfig(() => ({ ... }))` to create fresh integrations, processors, and loaders for multiple apps in one process. Reusing any integration, processor, or loader instance in another app now errors, including when a config factory returns fresh config objects.

- [#540](https://github.com/ecopages/ecopages/pull/540) [`96bf42d`](https://github.com/ecopages/ecopages/commit/96bf42de39bf6fe0578a66895b8a7c9ac757280e) Thanks [@andeeplus](https://github.com/andeeplus)! - During development, a change to a recorded build input marks only dependent Pages, HTML documents, browser entrypoints, and server routes dirty for rebuild. Changes matched by `additionalWatchPaths` invalidate all cached HTML documents because Ecopages cannot know which Pages read those arbitrary files. Public assets continue to trigger a browser reload.

- [#694](https://github.com/ecopages/ecopages/pull/694) [`476d694`](https://github.com/ecopages/ecopages/commit/476d69430cee598162434d1643422801995495b0) Thanks [@andeeplus](https://github.com/andeeplus)! - Allow Integration renderer hooks to be initialized from each renderer's app-owned options.

- [#602](https://github.com/ecopages/ecopages/pull/602) [`f1bebae`](https://github.com/ecopages/ecopages/commit/f1bebae9c14c2019c4341238f2196e1243ac2188) Thanks [@andeeplus](https://github.com/andeeplus)! - The deploy manifest of a server bundle, `dist/.server/manifest.json`, holds relative paths only, so a bundle built in one directory and moved to another starts with `ecopages start` there. It no longer records the build machine's `distDir`, source config path, or build time. `ecopages start` and the app share one lookup for the server entry, exported as `resolveProductionServerEntry` from `@ecopages/core/config`, and `resolveEcoConfigPath` and `resolveEmittedEcoConfigPath` take the app's `distDir` instead of assuming `dist`.

    **Breaking:**

    - `assertProductionConfigIdentity` takes the project root as its first argument; passing a finalized app config is no longer supported. Pass `appConfig.rootDir`, and `{ distDir: appConfig.distDir }` when the app sets one.
    - `manifest.json` loses `distDir`, `builtAt` and `sourceConfigPath`. Tools that read it should resolve `serverEntry` and `emittedConfigModule` against `dist/.server/` and `sourceConfigRelativePath` against the project root.

- [#500](https://github.com/ecopages/ecopages/pull/500) [`852398e`](https://github.com/ecopages/ecopages/commit/852398ebf178776da7f6de94345953fbab8151d4) Thanks [@andeeplus](https://github.com/andeeplus)! - A built server keeps running after it is moved to another directory, for example when it is built in CI and copied into a container image with a different root. Server output imports packages through paths relative to `dist/.server/` instead of absolute `file://` URLs from the build machine. `ecopages build` warns once per server output file that imports packages from outside the app folder, such as a workspace root, because those packages do not move with the app; each warning names the file and up to five packages.

    **Breaking:** A deployment must include `dist`, `src`, `package.json`, and the build's `node_modules` at their original relative paths. Start the deployed server with `node dist/.server/app.mjs`.

- [#497](https://github.com/ecopages/ecopages/pull/497) [`d6ea425`](https://github.com/ecopages/ecopages/commit/d6ea42557521af8ca257cdd6ea884c7a9cf992d7) Thanks [@andeeplus](https://github.com/andeeplus)! - Remove `buildOwnership` from the app config. An app always builds with Rolldown.

    **Breaking:** an `eco.config.ts` that sets `buildOwnership` no longer typechecks, and the field is ignored. Delete it from `eco.config.ts`.

- [#573](https://github.com/ecopages/ecopages/pull/573) [`451db72`](https://github.com/ecopages/ecopages/commit/451db7229ea4347dda001d102e85a7fbf410bd53) Thanks [@andeeplus](https://github.com/andeeplus)! - `createApp()` always uses the Node HTTP host. A Bun process still logs `Bun server running at`, because that line names the runtime that launched the process.

    On Bun, `ssr: true` scripts in `dependencies.scripts` now load through the same server build as on Node, so their CSS, MDX and image imports resolve as they do on Node. A Lit SSR script the asset pipeline cannot build is reported as a failed SSR preload instead of being imported from source.

    Ecopages packages no longer add Bun's global types to a TypeScript compilation, and the `ecopages` CLI no longer lists `bun-types` as a peer dependency.

    **Breaking:**

    - `createApp({ adapter })` is removed. There is no Bun adapter and no `adapter: 'auto'`.
    - `createApp()` no longer takes a WebSocket data type argument.
    - On Bun, `serverOptions` no longer reach `Bun.serve`. Only `port` and `hostname` are read, so Bun-only keys such as `tls` and `idleTimeout` are ignored.
    - An app that uses the `Bun` global or `import.meta.env` and got their types through an Ecopages package must install `@types/bun` itself. `@ecopages/core/env` no longer extends `Bun.Env`; read `ECOPAGES_*` variables from `process.env`, which works on Node and Bun.
    - `CustomElementScriptPreloader` requires `importServerModule`, and its `preferSourceImports` and `resolvePreloadEntrypoint` options are removed. `createCustomElementSsrPreloadEntrypointResolver` is replaced by `createCustomElementSsrPipelineImporter`, which imports the pipeline output itself.
    - `resolveRequestPipelineRuntime` is removed from `@ecopages/core/diagnostics/request-pipeline-metrics`.

- [#780](https://github.com/ecopages/ecopages/pull/780) [`c156bfd`](https://github.com/ecopages/ecopages/commit/c156bfd9ef34eb3050f52e7330cf7068c50431c5) Thanks [@andeeplus](https://github.com/andeeplus)! - Remove `ConfigBuilder` and the `@ecopages/core/config-builder` subpath. Author `eco.config.ts` with `defineConfig({ ... })` from `@ecopages/core/config`; `createApp()` loads and finalizes it. Validation and defaults are unchanged.

    **Breaking:** an `eco.config.ts` that exports `await new ConfigBuilder()...build()` no longer loads. Export `defineConfig({ ... })` instead. Most setters map to the field of the same name (`setIntegrations([...])` becomes `integrations: [...]`). The exceptions:

    - `setCacheConfig()` becomes `cache`.
    - `addProcessor()`, `addLoader()`, and `addSourceTransform()` become entries in `processors`, `loaders`, and `sourceTransforms`, keyed by each entry's `name`.
    - `setConfigModulePath()` is gone; Ecopages records the config file path itself.
    - `FinalizeEcoPagesConfigOptions` is no longer exported from `@ecopages/core/config`. The exported `finalizeEcoPagesConfig()` function still accepts inline `{ configFilePath, cwd }` options; `LoadEcoPagesConfigOptions` configures `loadEcoPagesConfig()`.

    `createApp()` and `loadEcoPagesConfig()` still load and finalize config automatically.

- [#572](https://github.com/ecopages/ecopages/pull/572) [`9bee11f`](https://github.com/ecopages/ecopages/commit/9bee11f8e1d60456d530d90235eafecdf0daef8b) Thanks [@andeeplus](https://github.com/andeeplus)! - Remove `ecopages dev:hot` and `-r` / `--react-fast-refresh`. On Node neither changed `ecopages dev`. Bun now launches the entry file with the same arguments, plus `--watch` when Node gets it.

    **Breaking:**

    - `ecopages dev:hot` is an unknown command. Use `ecopages dev`.
    - `-r` and `--react-fast-refresh` are unknown flags. There is no alias.
    - An app run directly (`node app.ts --dev --react-fast-refresh`) now fails with an unknown-option error for `--react-fast-refresh`.

- [#516](https://github.com/ecopages/ecopages/pull/516) [`93ec91b`](https://github.com/ecopages/ecopages/commit/93ec91b5de06086b0973cb07a9c079e7fd4378d0) Thanks [@andeeplus](https://github.com/andeeplus)! - Remove the `rendererModules` option from Integration renderers. No host passed it, so renderers always used the app's `html` template and added no island client script; that stays the behaviour.

    **Breaking:** `initializeRenderer()` on Integration plugins takes no arguments, and renderer constructors no longer accept `rendererModules`. Drop the option where a custom Integration passes it or overrides `initializeRenderer(options)`.

- [#686](https://github.com/ecopages/ecopages/pull/686) [`7b1a52c`](https://github.com/ecopages/ecopages/commit/7b1a52c3cc92b56d0d7e04e15b07301f5cd11ee4) Thanks [@andeeplus](https://github.com/andeeplus)! - A component render no longer reports the tag of its root element.

    **Breaking:** `ComponentRenderResult` and `ForeignSubtreeRenderPayload` lose `rootTag`, and `IntegrationRenderer` loses `getRootTagName()`. Nothing in core read the value; it was computed with a regex on every component render. A custom Integration that returns `rootTag` from `renderComponent` should drop it.

- [#661](https://github.com/ecopages/ecopages/pull/661) [`d4c4e1d`](https://github.com/ecopages/ecopages/commit/d4c4e1d3c9cf956d50c5e95d261e44f6fcf43e26) Thanks [@andeeplus](https://github.com/andeeplus)! - The browser runtime plugin now maps manifest specifiers to their public URLs only while the bundler resolves imports, and no longer reads and rewrites every JavaScript module.

    **Breaking:** `@ecopages/core/build/browser-runtime-plugin` no longer exports `rewriteBrowserRuntimeImports`, `getBrowserRuntimeImportRewriteMap`, `collectBrowserRuntimeManifests` or `collectBrowserRuntimeImportRewriteMap`, and `createBrowserRuntimePlugin` no longer takes `rewriteImports`. `applySourceTransforms` and `createEcoComponentMetaPlugin` are removed; use `createEcoComponentMetaTransform` with `createEcoBuildPluginFromSourceTransform`. `EcoBuildOnLoadResult` no longer has `resolveDir`, which nothing read. A source transform that has the name of another plugin in the same build request now throws instead of being dropped without notice. A browser build drops manifest specifiers (such as `react`) from `external`, so they still become their public URLs; and a tsconfig `paths` alias with the same name as a manifest specifier now wins over the public URL, where the old source rewrite ignored it.

- [#780](https://github.com/ecopages/ecopages/pull/780) [`2b79877`](https://github.com/ecopages/ecopages/commit/2b79877690284fad9641449a52b7b27cc463c9c4) Thanks [@andeeplus](https://github.com/andeeplus)! - An app's build ownership now comes only from its installed build adapter.

    **Breaking:** `setAppBuildOwnership()` is removed from `@ecopages/core/build/build-adapter`. Register the adapter with `setAppBuildAdapter(appConfig, createBuildAdapter())` instead.

- [#496](https://github.com/ecopages/ecopages/pull/496) [`552dd03`](https://github.com/ecopages/ecopages/commit/552dd03eedce689c0918a7eea06c38a2ee84c6df) Thanks [@andeeplus](https://github.com/andeeplus)! - Remove dev host helpers that nothing calls.

    **Breaking:** the `@ecopages/core/dev/hmr-manager-registry`, `@ecopages/core/hmr/hmr-file-change-prep` and `@ecopages/core/dev/dev-client-ownership` subpaths are gone. `planFileChange()`, `invalidateServerModules()`, `broadcastClientEvent()` and `isServerRenderedTemplatePlan()` have no replacement.

- [#600](https://github.com/ecopages/ecopages/pull/600) [`dcceabd`](https://github.com/ecopages/ecopages/commit/dcceabd4f831cb272ffe70a68a19208b4486ea09) Thanks [@andeeplus](https://github.com/andeeplus)! - Remove the hooks and options no plugin uses. `ecopages build` and `ecopages preview` render every Page from source on each run, and `ecopages build --help` now says what the build does.

    **Breaking:**

    - `didChange()` is gone from `Processor` and `IntegrationPlugin`. No shipped plugin overrode it; remove your override.
    - `runtimeCapability`, `RuntimeCapabilityDeclaration` and `RuntimeCapabilityTag` are gone from `Processor`, `IntegrationPlugin` and their configs, and config finalization no longer validates them. Remove the declaration.
    - `afterStaticExport` is gone from `IntegrationPlugin`. Remove the hook; `staticExport` replaces `beforeStaticExport`. With `sitemap.enabled`, `sitemap.xml` is still written after every page.
    - The `onLoad` callback of a build plugin no longer receives `addDependency`. Remove the call; core records the loaded path.
    - `EcoBuildLoader` is `js`, `jsx`, `ts`, `tsx` or `object`. A plugin that returned another kind, such as `css`, `json` or `text`, now gets the module type of its file extension; return `js` source or `object` exports instead.
    - `Processor.teardown()`, `IntegrationPlugin.options` and `ProcessorConfig.description` are gone. Remove the override, the `options` access and the `description` you pass. Integration `teardown()` stays and core still calls it.

- [#568](https://github.com/ecopages/ecopages/pull/568) [`1ac0930`](https://github.com/ecopages/ecopages/commit/1ac0930a56aa9d3cc6e7883ad575c1c39d6185b7) Thanks [@andeeplus](https://github.com/andeeplus)! - Remove the Vite host. Dev and build run on the Node and Bun adapters, and Rolldown owns every build.

    **Breaking:**

    - The Vite plugin package is removed.
    - `createApp()` no longer takes an embedded runtime or a host-owned dev client. `app.start()` always boots the server.
    - Build ownership is only Rolldown. `createBuildAdapter()` takes no arguments, and the host build-adapter marker is removed.
    - The Vite plugin adapters for source transforms and component metadata are removed.
    - The `@ecopages/core/dev/host-runtime` subpath is removed.
    - Hosts can no longer attach WebSocket upgrades on a shared server or leave unmatched upgrades for another listener. Unmatched upgrades are destroyed.

- [#678](https://github.com/ecopages/ecopages/pull/678) [`3bd811c`](https://github.com/ecopages/ecopages/commit/3bd811ceb711da4154821da7cd9c7a5bfcdd0841) Thanks [@andeeplus](https://github.com/andeeplus)! - Renders of one Integration run at the same time. A static export of a site with one Integration now renders as many pages in parallel as it has workers instead of one at a time.

    **Breaking:** An Integration renderer keeps no assets between renders. The assets a render collects belong to that render, and the HTML transformer injects the page package it is given on each call instead of holding one. A renderer that set or read the transformer's page package or processed dependencies, or called `appendProcessedDependencies` outside a render, must work from the page package of its render instead; appending outside a render now throws. `finalizeDocumentShellHtml`, `applyDocumentShellAttributeStamping` and the `DocumentShellAttributeStamping` type are removed from `@ecopages/core/route-renderer/orchestration/document-shell/document-shell-render.service`; nothing in core called them.

- [#668](https://github.com/ecopages/ecopages/pull/668) [`433b970`](https://github.com/ecopages/ecopages/commit/433b970e566951dc2cf68343a0424ab6ff408911) Thanks [@andeeplus](https://github.com/andeeplus)! - The app's build manifest is sealed once, with its plugins already split into a server list and a browser list, so a build request no longer filters a mixed list by environment on every read. The plugin order of a request is decided in one place and documented there: caller plugins, then the alias resolver, the manifest plugins, JSX ownership plugins, and source transforms.

    **Breaking:** `AppBuildManifest` has `server` and `browser` instead of `plugins`. `createAppBuildManifest` takes the registrations and the browser runtime manifest, `sealAppBuildManifest(appConfig)` replaces `collectConfiguredAppBuildManifestContributions`, `createConfiguredAppBuildManifest` and `updateAppBuildManifest`, and `getAppServerBuildPlugins`, `getAppBrowserBuildPlugins`, `getServerBuildPlugins`, `getBrowserBuildPlugins` and `getBrowserRuntimeManifest` are removed. Read a list from `getAppBuildManifest(appConfig)`.

- [#507](https://github.com/ecopages/ecopages/pull/507) [`5af0c5f`](https://github.com/ecopages/ecopages/commit/5af0c5f7d6a6d7091143760fb9d7c301301b6be2) Thanks [@andeeplus](https://github.com/andeeplus)! - A server built with the image processor now starts with `ecopages start --runtime node` instead of failing with `Could not load the "sharp" module`. Server output no longer bundles compiled packages from `node_modules` that the app does not declare, such as the dependencies of processors and integrations; it imports them through paths relative to `dist/.server/`, so packages with native bindings or files loaded relative to themselves keep working. Server code bundled into `dist/.server/app.mjs` and into the page modules built for rendering now keeps `import.meta.url`, `import.meta.dirname` and `import.meta.filename` pointing at its source files, as `eco.config.mjs` already did, for `.ts`, `.tsx`, `.js` and `.jsx` modules. A page that reads files relative to `import.meta.dirname`, such as a glob of `src/pages`, finds them again in production builds, and Core reads its own version and dependency list instead of a `package.json` next to the bundle.

    **Breaking:** Server output imports compiled dependencies from the dependency installation used at build time. Deploy that `node_modules` tree at the same relative path from the server output, including a workspace-level installation when packages resolved there.

- [#684](https://github.com/ecopages/ecopages/pull/684) [`0b01998`](https://github.com/ecopages/ecopages/commit/0b019986aec3fa7f63c15958d07de378c3f4e978) Thanks [@andeeplus](https://github.com/andeeplus)! - Static export decides the sitemap eligibility of a filesystem page from the metadata its render returned, as it already does for explicit views, instead of loading the page and resolving its `staticProps` and `metadata` a second time. A page whose render fails is not exported and not listed. Lit pages rendered in the static render worker send their resolved metadata back with the HTML.

    **Breaking:** `RouteRenderResult.metadata` is required. A custom Integration that overrides `execute` must return the metadata its render used, as `IntegrationRenderer.execute` does; before, a result without it was silently left out of the sitemap.

- [#767](https://github.com/ecopages/ecopages/pull/767) [`d9dd2eb`](https://github.com/ecopages/ecopages/commit/d9dd2eb2f6aeb3fa886eaf5ea509143d7e45780a) Thanks [@andeeplus](https://github.com/andeeplus)! - Replace `rapidhash` and duplicate SHA-1/SHA-256 recipes with `contentHash(input, length?)`, which returns a stable SHA-256 digest in lowercase hexadecimal.

    **Breaking:** Remove `rapidhash` from `@ecopages/core/build`. Use `contentHash(input, 16)` for its former 64-bit SHA-256 prefix in hexadecimal; convert that prefix to a bigint only when a numeric representation is required.

- [#533](https://github.com/ecopages/ecopages/pull/533) [`0e0a63f`](https://github.com/ecopages/ecopages/commit/0e0a63f011f3faf7ec6fe56f91418aaa452302b9) Thanks [@andeeplus](https://github.com/andeeplus)! - Build requests declare a server or browser environment. The React, MDX, and Ecopages JSX Integrations, and the Content, Image, and PostCSS Processors, contribute bundler plugins through `plugins` with environment selection. Duplicate plugin names in the same environment fail during configuration.

    **Breaking:** Custom Integrations must move `browserBuildPlugins` contributions to `plugins` with `environments: ['browser']`; custom Processors must do the same for `buildPlugins`. Replace transpile profile arguments with the `server` or `browser` environment.

- [#617](https://github.com/ecopages/ecopages/pull/617) [`f60ed39`](https://github.com/ecopages/ecopages/commit/f60ed39e1d875427226d8f64a739c0e211704c18) Thanks [@andeeplus](https://github.com/andeeplus)! - Preserve original source locations through core transforms, compose maps from chained build plugins and MDX compilation, and honor linked versus hidden sourcemap modes. The MDX module map now carries the `.mdx` source, so browser devtools can show it. The server bundle and the bundled config use `linked` maps, so `node --enable-source-maps` keeps mapping server stack traces.

    **Breaking:**

    - `BuildOptions.target`, `BuildOptions.format`, `BuildOptions.sourcemap` and the `BuildTranspileOptions` equivalents accept the `BuildTarget`, `BuildFormat` and `BuildSourcemap` unions instead of any `string`. Pass one of the documented values.
    - `sourcemap: 'linked'` now writes a `sourceMappingURL` comment, and `sourcemap: 'hidden'` writes the map file without one. `hidden` used to behave like `linked`; use `linked` if you want the comment.
    - `attributeMdxComponentIdentity()` from `@ecopages/core` returns `{ code, map }` instead of a string and takes the compiler map as an optional fifth argument. Read `result.code` where you used the string.

- [#728](https://github.com/ecopages/ecopages/pull/728) [`76f220c`](https://github.com/ecopages/ecopages/commit/76f220c1412a02c5330213e8e019bfd6bbe9851d) Thanks [@andeeplus](https://github.com/andeeplus)! - Static builds now fail when a filesystem or explicit Page fails to render, after collecting route-specific failures and finishing the remaining export work. `ecopages build --keep-going` retains the previous log-and-continue behavior.

- [#677](https://github.com/ecopages/ecopages/pull/677) [`94af66f`](https://github.com/ecopages/ecopages/commit/94af66f0293c9b50e53907ecb0e57d995201dd92) Thanks [@andeeplus](https://github.com/andeeplus)! - Static export releases what an Integration started for it. `IntegrationPlugin.staticExport(context)` replaces `beforeStaticExport(context)` and may return a function that core awaits once the export ends, on success or failure, in reverse order of the Integrations. The Lit Integration stops its render worker through it, so an in-process export no longer leaves the worker thread running. When `ecopages build` defers setup and the first page render runs the Lit `setup()`, it reuses the session `staticExport()` started instead of starting a second worker.

    `ecopages build` no longer calls `process.exit(0)` after the export; the process ends on its own once the releases have run.

    **Breaking:**

    - `IntegrationPlugin.beforeStaticExport()` is gone. Rename your override to `staticExport()`; it receives the same `StaticExportContext`. To clean up after the export, return an async function from it instead of relying on the process exiting. A release that throws is logged and does not fail the export.
    - `ecopages build` ends when nothing keeps the event loop alive. An Integration or Processor that leaves a worker, timer or socket running now keeps the build open; stop it in the release returned from `staticExport()` or in `teardown()`.
    - `StaticExportRelease` is exported from `@ecopages/core/plugins/integration-plugin`.

- [#506](https://github.com/ecopages/ecopages/pull/506) [`836cbea`](https://github.com/ecopages/ecopages/commit/836cbea28790fd284604acb395dbc1e8fd49fc5e) Thanks [@andeeplus](https://github.com/andeeplus)! - Build errors keep their details. A failed build's logs now carry Rolldown's `code`, `plugin`, `hook`, `id`, `loc`, `frame` and `stack` next to `message`, and the errors Ecopages raises from them name the plugin, the file and the position. An error thrown by a build plugin, in `setup`, a resolve or load callback or its `transform`, names that plugin and the file it was handling, and a successful build returns its warnings. During `ecopages dev`, when a client-side module that the dev server sends to the browser, such as a `*.script.ts` file or a hydrated component, fails to build, the error is shown at the bottom of the page until the next update.

    **Breaking:** the `BuildLog` type is no longer exported from `@ecopages/core/build/build-adapter`. Type a log entry as `BuildResult['logs'][number]`.

- [#769](https://github.com/ecopages/ecopages/pull/769) [`e7e48fa`](https://github.com/ecopages/ecopages/commit/e7e48fa2f53a5680dfb18393ff8e6d25265e9e83) Thanks [@andeeplus](https://github.com/andeeplus)! - Centralize Ecopages environment configuration and runtime mode access. Boolean settings now accept `true` or `1` to enable and `false` or `0` to disable; core exports typed environment helpers, and browser runtime helpers receive the mode used to build the bundle.

- [#590](https://github.com/ecopages/ecopages/pull/590) [`268ef9d`](https://github.com/ecopages/ecopages/commit/268ef9d0add25f8fe3fcfe2113ce59823b803c4a) Thanks [@andeeplus](https://github.com/andeeplus)! - **Breaking:** Remove layout runtime scanning. `LayoutOptions.runtimeProvider` is removed, and layout files no longer add npm packages to the shared vendor bundles. Migrate by deleting `runtimeProvider` from layouts and listing each shared package in `reactPlugin({ runtimeModules })` using the exact specifier that app code imports.

- [#729](https://github.com/ecopages/ecopages/pull/729) [`384b343`](https://github.com/ecopages/ecopages/commit/384b343e96f03049b4a1b305a0fa62e2fda56829) Thanks [@andeeplus](https://github.com/andeeplus)! - Breaking: Route params are decoded once per URL segment in every route kind, so handlers receive values such as `café` instead of `caf%C3%A9`. Encoded slashes remain within their original segment, and malformed escapes return HTTP 400. Remove manual decoding of route params.

- [#599](https://github.com/ecopages/ecopages/pull/599) [`9e495f2`](https://github.com/ecopages/ecopages/commit/9e495f2c0bdf136464da8d45468496cd7492e7bf) Thanks [@andeeplus](https://github.com/andeeplus)! - Remove navigation coordinator and HMR manager members that nothing called.

    **Breaking:** `EcoNavigationRuntime` no longer has `setOwner`, `isOwnedByAnotherRuntime`, `subscribe` or `cleanupCurrentOwner`, and `@ecopages/core/router/navigation-coordinator` no longer exports `EcoNavigationRuntimeEvent` or `EcoNavigationRuntimeListener`. Call `claimOwnership` instead of `setOwner`, compare `getOwnerState().owner` with your own name instead of `isOwnedByAnotherRuntime`, call `cleanupOwner(getOwnerState().owner)` instead of `cleanupCurrentOwner`, and read `getOwnerState()` when you need the current owner; there is no replacement for change events. `IHmrManager` no longer has `getOutputUrl`, `getRuntimeWorkDir` or `getRuntimePath`; read an entrypoint's URL from `getRegisteredEntrypoints().get(path)?.outputUrl`, or use the `outputUrl` that `registerEntrypoint` and `registerScriptEntrypoint` return. `@ecopages/core/hmr/hmr-entrypoint-output` no longer exports `ResolvedHmrEntrypoint` or `HmrEntrypointRole`; import `ResolvedHmrEntrypoint` from `@ecopages/core`.

### Patch Changes

- [#695](https://github.com/ecopages/ecopages/pull/695) [`44ec56c`](https://github.com/ecopages/ecopages/commit/44ec56c0da5dab7f6df2b02f8ef4b5ef06a4addb) Thanks [@andeeplus](https://github.com/andeeplus)! - Keep the generated Integration renderer's `name` property concrete in its constructor type so consumers can subclass the factory result without re-declaring it.

- [#716](https://github.com/ecopages/ecopages/pull/716) [`0e04ec6`](https://github.com/ecopages/ecopages/commit/0e04ec6008ca04f8de1ea6cb48377141f454d372) Thanks [@andeeplus](https://github.com/andeeplus)! - HTML Pages: a Page head tag whose key the shell repeats, such as a light and a dark `theme-color`, now replaces the shell tags in source order instead of leaving a stale shell copy behind. Two classic scripts that would be written to the same output, such as `legacy.ts` beside `legacy.js`, are rejected with an error naming both files, and a classic script is compiled once per source revision rather than once for validation and once for emit.

- [#715](https://github.com/ecopages/ecopages/pull/715) [`294a354`](https://github.com/ecopages/ecopages/commit/294a3544a444fcc2408374c65c0725a1810edfed) Thanks [@andeeplus](https://github.com/andeeplus)! - Builds that differ only in the browser runtime manifest, the project's tsconfig path aliases or the MDX compiler options no longer share one build identity, so a deduplicated or reused build cannot hand one configuration the output of another.

- [#726](https://github.com/ecopages/ecopages/pull/726) [`2c4044d`](https://github.com/ecopages/ecopages/commit/2c4044d45467ba31f395ba404ec81c9d87147ed7) Thanks [@andeeplus](https://github.com/andeeplus)! - Escape generated script and stylesheet URLs and declared HTML attribute values.

- [#571](https://github.com/ecopages/ecopages/pull/571) [`a5fd67d`](https://github.com/ecopages/ecopages/commit/a5fd67d38b5f47c81c9fefb5d6cf18845cd712ad) Thanks [@andeeplus](https://github.com/andeeplus)! - Watch source files recursively so server-only import edits invalidate affected pages

- [#582](https://github.com/ecopages/ecopages/pull/582) [`6e40453`](https://github.com/ecopages/ecopages/commit/6e4045372e195b65d2e1a96d6c36763f09fff171) Thanks [@andeeplus](https://github.com/andeeplus)! - The dev file watcher applies a continuous stream of edits at least once per second instead of waiting for it to pause, fails startup with a clear error if the watcher is not ready within 30 seconds, and logs error stacks for watcher, prewarm and static generation failures.

- [#637](https://github.com/ecopages/ecopages/pull/637) [`4513b61`](https://github.com/ecopages/ecopages/commit/4513b6108ee74160c680108f8a50f1aa613d8359) Thanks [@andeeplus](https://github.com/andeeplus)! - Build plugin transforms now run for a module id with a query, such as `/src/a.ts?v=1`, when the filter matches the path (`/\.ts$/`). On Windows, a path that starts with a drive letter (`C:\app\a.ts`) is no longer read as a plugin namespace, so transforms, `onResolve` and `onLoad` handlers see the full path.

- [#570](https://github.com/ecopages/ecopages/pull/570) [`15a9b79`](https://github.com/ecopages/ecopages/commit/15a9b799c52d35e6c2c0ec843a1d78a24a1bcf79) Thanks [@andeeplus](https://github.com/andeeplus)! - A production build made on Bun now server-renders a Lit custom element that a page from another integration renders without declaring it.

- [#511](https://github.com/ecopages/ecopages/pull/511) [`840cca6`](https://github.com/ecopages/ecopages/commit/840cca68f800a872180289a6ac0717cb97a90e68) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix `ecopages start --runtime bun` refusing a Bun build with "Ecopages config mismatch". The build now records the config hashes in `dist/.server/manifest.json` with SHA-256 under every runtime, the same hash `start` checks. Rebuild an existing Bun build once; Node builds are unaffected.

- [#733](https://github.com/ecopages/ecopages/pull/733) [`4157f71`](https://github.com/ecopages/ecopages/commit/4157f71b9715aaef4c0e6b3cc210c9242dacd308) Thanks [@andeeplus](https://github.com/andeeplus)! - Reuse app-wide browser assets for dynamic SSR routes covered by a route template when their grouped browser dependencies and page-client entries match.

- [#732](https://github.com/ecopages/ecopages/pull/732) [`80d07b4`](https://github.com/ecopages/ecopages/commit/80d07b43eec74e5b46844055c77ec7457056e343) Thanks [@andeeplus](https://github.com/andeeplus)! - Reuse the production app browser build during server startup

- [#538](https://github.com/ecopages/ecopages/pull/538) [`56d5df1`](https://github.com/ecopages/ecopages/commit/56d5df1cae2a872aa9afc85bbf6ab84f6f8ce75f) Thanks [@andeeplus](https://github.com/andeeplus)! - `ecopages dev` now restarts when a project file that `eco.config.ts` imports changes, not only when the config or dotenv files change. Plugin option edits take effect without a manual restart. Components and helpers the config imports lose hot reload.

- [#537](https://github.com/ecopages/ecopages/pull/537) [`bfb12e5`](https://github.com/ecopages/ecopages/commit/bfb12e56842b89818ae77a466371a59ef71a4b96) Thanks [@andeeplus](https://github.com/andeeplus)! - Preview and production builds now resolve content collection `/browser` modules from disk so relative MDX imports work, emit empty transform maps so Rolldown does not warn, hydrate React islands on non-React routes from the page client plan, stamp lazy-trigger attributes onto serialized foreign-child HTML, keep resolved lazy triggers across a second dependency pass, give concurrent grouped content-script builds unique temp files, and re-export named island module exports so hydration scripts can resolve the component.

- [#659](https://github.com/ecopages/ecopages/pull/659) [`c7177f7`](https://github.com/ecopages/ecopages/commit/c7177f781903bf846450a427b078f0e3cc9a8e2a) Thanks [@andeeplus](https://github.com/andeeplus)! - Core's browser server-only guard and server CSS shim now declare Rolldown hook filters, so they no longer run for every module of a build. The Node builtin externalizer is gone: Rolldown's node platform already keeps builtins external. A failed output write no longer leaves the Rolldown bundle open.

- [#709](https://github.com/ecopages/ecopages/pull/709) [`9d8c968`](https://github.com/ecopages/ecopages/commit/9d8c968846cebbb993a4b7f203c44fa7e6e54e44) Thanks [@andeeplus](https://github.com/andeeplus)! - Pages with different grouped-script dependency sets no longer reuse one another's outputs.

- [#567](https://github.com/ecopages/ecopages/pull/567) [`32e5ab9`](https://github.com/ecopages/ecopages/commit/32e5ab9d27a43e262ad00081f11b42da32f182ac) Thanks [@andeeplus](https://github.com/andeeplus)! - Run development prewarm path collection in the background so slow or failed Processor hooks do not delay server readiness.

- [#776](https://github.com/ecopages/ecopages/pull/776) [`a225788`](https://github.com/ecopages/ecopages/commit/a22578874431df65e86f7683a57e24aadf0ea108) Thanks [@andeeplus](https://github.com/andeeplus)! - Keep view-transition names correct when a later navigation commits, skips animation, fails, or becomes stale.

- [#454](https://github.com/ecopages/ecopages/pull/454) [`0fc9efd`](https://github.com/ecopages/ecopages/commit/0fc9efd66ae07c8f176def2aee7290dfd10d756c) Thanks [@andeeplus](https://github.com/andeeplus)! - `ecopages dev` no longer treats a sibling folder whose name starts with the public, pages, includes or `src` folder's name as that folder. An edit to `src/public-api/client.ts` was handled as a public asset: it was copied outside `dist` and never reached the Page, because server modules were not invalidated. Files in folders such as `src/pages-old/` are now ordinary source files too.

- [#631](https://github.com/ecopages/ecopages/pull/631) [`cf5d3c0`](https://github.com/ecopages/ecopages/commit/cf5d3c016aaa8a5f41f137136f71b3d963337c2c) Thanks [@andeeplus](https://github.com/andeeplus)! - A Dev Toolbar that cannot be bundled no longer turns off hot reloading in `ecopages dev`. When `devToolbar.package` is not installed or fails to bundle, the log now reports that the Dev Toolbar could not be bundled, and pages keep their HMR client and receive updates. Before, a missing package stopped the dev server from finishing startup, and a package that failed to bundle left every page without HMR for the session.

- [#541](https://github.com/ecopages/ecopages/pull/541) [`afdf6bf`](https://github.com/ecopages/ecopages/commit/afdf6bf52264f399e5b3620215436bd8e7bc086c) Thanks [@andeeplus](https://github.com/andeeplus)! - Development can hydrate islands whose source lives in a workspace-linked package. Those modules are served from `/assets/__eco_dev__/@fs/...` instead of being rejected for sitting outside the app `src` folder.

- [#492](https://github.com/ecopages/ecopages/pull/492) [`7542162`](https://github.com/ecopages/ecopages/commit/75421624b5d342e977f6b568b02e902e7610d51c) Thanks [@andeeplus](https://github.com/andeeplus)! - After upgrading a package used in the browser, the development server now serves the new version instead of a stale copy. Files under `/assets/vendors` are no longer marked `immutable` in development; browsers revalidate them on each load with an `ETag` and get `304 Not Modified` while a file is unchanged. This covers integration runtime files whose names do not change between versions, such as React's. Bare imports that are prebundled on demand are built on the first request of each dev process and kept in memory, so a restart always serves the installed packages.

- [#517](https://github.com/ecopages/ecopages/pull/517) [`2c88724`](https://github.com/ecopages/ecopages/commit/2c88724c8af009832ccc9340119cdff9959f9ce2) Thanks [@andeeplus](https://github.com/andeeplus)! - In development, a browser import of a workspace-linked package (for example a pnpm `workspace:` dependency) now gets a new prebundled file after you edit any file of that package, not only its entry file, so restarting the development server serves the edited code instead of a stale copy.

- [#780](https://github.com/ecopages/ecopages/pull/780) [`53bd531`](https://github.com/ecopages/ecopages/commit/53bd531bb017ba621b013512ad4dc0f995eb170b) Thanks [@andeeplus](https://github.com/andeeplus)! - Routes whose last segment contains a dot, such as `/v1.2` from `src/pages/v1.2.html`, are now served in development and by the Node static preview instead of returning 404. A path is treated as a static file only when it ends in a known static extension. Both static previews also serve a dotted directory such as `/release.notes/` from its `index.html`.

- [#633](https://github.com/ecopages/ecopages/pull/633) [`267917e`](https://github.com/ecopages/ecopages/commit/267917ecfed51d00df34821d0452b466abba5140) Thanks [@andeeplus](https://github.com/andeeplus)! - A build now hands each caller the file emitted for its own entry. Page script bundles, route modules, collection server modules, HTML Page module scripts and the dev transform server used to pick an output by file name or take the first JavaScript file, which returned a shared chunk when a build split code.

- [#580](https://github.com/ecopages/ecopages/pull/580) [`b5adb2c`](https://github.com/ecopages/ecopages/commit/b5adb2c3242df9c7a634daaa5e2ca12c0b889115) Thanks [@andeeplus](https://github.com/andeeplus)! - Development refreshes pages and browser bundles after an edit to any file a page reads on the server, including helpers outside the component folders and files plugins read while building.

- [#569](https://github.com/ecopages/ecopages/pull/569) [`b85997a`](https://github.com/ecopages/ecopages/commit/b85997a4457485c75cee3a2f3cc882249658198a) Thanks [@andeeplus](https://github.com/andeeplus)! - Invalidate affected caches when plugin-declared files change

- [#523](https://github.com/ecopages/ecopages/pull/523) [`ab6456b`](https://github.com/ecopages/ecopages/commit/ab6456ba8ee47bf495ccc307bb3bc874e9fbc5e5) Thanks [@andeeplus](https://github.com/andeeplus)! - During development, a shared module change marks every Page that imports it as dirty, including dependencies reached through dynamic imports. Browser script URLs come from the chunks emitted for that Page, including shared chunks.

- [#527](https://github.com/ecopages/ecopages/pull/527) [`d830944`](https://github.com/ecopages/ecopages/commit/d830944931e1736ac90a2c7f20db0eb74c23e6f8) Thanks [@andeeplus](https://github.com/andeeplus)! - Name production CSS, copied scripts, and image variants from a hash of the bytes that are written, so a content or encoding change gets a new URL. Development keeps source-relative CSS and copied-script paths so HMR can refresh the same href.

- [#526](https://github.com/ecopages/ecopages/pull/526) [`c6aefde`](https://github.com/ecopages/ecopages/commit/c6aefde210681db95b83a7f97c75aba86bdb7c1a) Thanks [@andeeplus](https://github.com/andeeplus)! - Server builds resolve Core runtime imports without changing authored text that happens to look like an import. Browser assets keep their final generated names and URLs.

- [#717](https://github.com/ecopages/ecopages/pull/717) [`f764dfb`](https://github.com/ecopages/ecopages/commit/f764dfb11ec4c9bde3e82b050c6aa5d6f319a424) Thanks [@andeeplus](https://github.com/andeeplus)! - Reload pages when a source module shared by an island changes.

- [#643](https://github.com/ecopages/ecopages/pull/643) [`017c524`](https://github.com/ecopages/ecopages/commit/017c5244e010775ed6d760a9a4eace707a5783f0) Thanks [@andeeplus](https://github.com/andeeplus)! - Saving a page or island entry in `ecopages dev` no longer marks its server modules stale a second time or imports them again on the file event. The server code is rebuilt on the next request, like every other edit, so a save does less work before the browser update is sent.

- [#488](https://github.com/ecopages/ecopages/pull/488) [`1390084`](https://github.com/ecopages/ecopages/commit/139008462ec6a812dcc2a119bb95c3cb438f2bb4) Thanks [@andeeplus](https://github.com/andeeplus)! - Editing a file in the public directory or one matched by `additionalWatchPaths` reloads the page in development. These edits previously needed a manual reload.

- [#541](https://github.com/ecopages/ecopages/pull/541) [`b9095f9`](https://github.com/ecopages/ecopages/commit/b9095f9d0f163bf1071efb2e5647118d9ad9a1e0) Thanks [@andeeplus](https://github.com/andeeplus)! - React Pages hydrate their own Page, Layout, Html, and include content through the page bootstrap without extra per-component island scripts. React components rendered inside a Page owned by another Integration receive their own hydration scripts.

- [#520](https://github.com/ecopages/ecopages/pull/520) [`a204edd`](https://github.com/ecopages/ecopages/commit/a204edd8f094fc327149ead25e685670e1114b8a) Thanks [@andeeplus](https://github.com/andeeplus)! - Restart development when workspace-linked package files change, reloading server imports and rebuilding browser vendors with current dependency code.

- [#541](https://github.com/ecopages/ecopages/pull/541) [`a73167d`](https://github.com/ecopages/ecopages/commit/a73167dcde8806b391cd9a59a33cab0a9856c038) Thanks [@andeeplus](https://github.com/andeeplus)! - In development, the first visit to a page no longer reloads the browser just because the watcher started listening to a file that page already read.

- [#449](https://github.com/ecopages/ecopages/pull/449) [`1990d16`](https://github.com/ecopages/ecopages/commit/1990d16622d61feb39b3184699755f6eda579093) Thanks [@andeeplus](https://github.com/andeeplus)! - React island props that contain text outside Latin-1, such as `€`, CJK characters or emoji, no longer crash server rendering. The islands hydrate with the same text, and the dev toolbar's Islands panel previews it instead of garbled characters.

- [#482](https://github.com/ecopages/ecopages/pull/482) [`bd31dcb`](https://github.com/ecopages/ecopages/commit/bd31dcbba6b4402e0bad9eb067f2ba9b14c31c85) Thanks [@andeeplus](https://github.com/andeeplus)! - In development, editing a script or server module that no browser module imports now reloads the page. Before, it sent hot updates for unrelated scripts and the page kept the old code. This also makes editing an HTML Page classic script (`<script src>` without `type="module"`) under `src/pages/` reload the page.

- [#490](https://github.com/ecopages/ecopages/pull/490) [`cee05ea`](https://github.com/ecopages/ecopages/commit/cee05eabb31dd0cf78317fd6eb19db7da4e07a87) Thanks [@andeeplus](https://github.com/andeeplus)! - Fix Island Hosts rendered as a Foreign Subtree missing `data-eco-island`. Root attributes with an empty value were dropped, so the Dev Toolbar did not list these islands and React did not unmount islands nested in an element that was removed. Empty-valued root attributes are now kept as `name=""`.

- [#575](https://github.com/ecopages/ecopages/pull/575) [`87af373`](https://github.com/ecopages/ecopages/commit/87af373077358538e1bf9e46aba05870c247efeb) Thanks [@andeeplus](https://github.com/andeeplus)! - When shutdown fails during a development restart, the error is logged with its nested errors and causes, and the CLI starts a fresh server.

- [#692](https://github.com/ecopages/ecopages/pull/692) [`873e38b`](https://github.com/ecopages/ecopages/commit/873e38b4f2387f12dafe99bba080d0e1d7e5b5c4) Thanks [@andeeplus](https://github.com/andeeplus)! - Two renders that overlap and share a component with lazy client scripts both keep its lazy entries. Resolving the lazy triggers of one render no longer takes the pending entries away from the other, which could leave its page without the lazy scripts.

- [#468](https://github.com/ecopages/ecopages/pull/468) [`1bea878`](https://github.com/ecopages/ecopages/commit/1bea878fc8edae81839704b3d8aa3f391b7b890b) Thanks [@andeeplus](https://github.com/andeeplus)! - Build plugins: a filter registered with a `namespace` is now tested against the path after `<namespace>:`, as written. Before, a filter that did not start with `^` lost its first character, so `/\.md$/` in namespace `docs` did not match `docs:intro.md`, and a build with eleven or more virtual modules loaded the eleventh with the second one's contents.

- [#530](https://github.com/ecopages/ecopages/pull/530) [`13b96f1`](https://github.com/ecopages/ecopages/commit/13b96f1f081743b29e5edd9d1947e9d60d34c390) Thanks [@andeeplus](https://github.com/andeeplus)! - Edits to files imported by `eco.config.ts`, shared Page modules, and content under Processor watch paths appear in the next `ecopages build`; these inputs are no longer hidden by cached output from an earlier process.

    **Breaking:** `ecopages build --force`, `ecopages preview --force`, and `ecopages start --force` fail as unknown options. Remove `--force`; production builds no longer reuse persisted cache state.

- [#664](https://github.com/ecopages/ecopages/pull/664) [`cacb592`](https://github.com/ecopages/ecopages/commit/cacb59272bd03dc39f42b2d05b49070e5e01de28) Thanks [@andeeplus](https://github.com/andeeplus)! - Server builds take one set of defaults from the server environment. Route modules, collection modules and the unified pages graph used to override the server `node` target with `es2022`; they now keep the `node` target like the server entry. Server modules are therefore no longer lowered to ES2022: syntax newer than that reaches the runtime as written, so the runtime must support it. Ecopages requires Node 24 or newer, which does.

- [#683](https://github.com/ecopages/ecopages/pull/683) [`f9c09f7`](https://github.com/ecopages/ecopages/commit/f9c09f7a00784dae251ccd7295e1e3570869d716) Thanks [@andeeplus](https://github.com/andeeplus)! - A production render of a Page or explicit view that has not changed skips the dependency work it already did. The assets of its Html template, Layouts and Page, its client entries, and the assets of each component it renders are resolved on its first render and reused after that. A Page whose `dependencies` is a function still resolves them on every render, because they can depend on the props, params and query. Development, and any process with HMR enabled (even under `NODE_ENV=production`), resolves them on every render as before.

- [#616](https://github.com/ecopages/ecopages/pull/616) [`05592de`](https://github.com/ecopages/ecopages/commit/05592de5ea9db8a085c11d4467aecdfe1512cd3f) Thanks [@andeeplus](https://github.com/andeeplus)! - A production server no longer repeats development work on each request. It reuses a module it has imported, a processed asset, and a component's virtual imports without hashing or reading their sources again, gzips each emitted CSS and JS file once instead of on every render, skips collecting the source paths that only development invalidation reads, and shares one asset processor run between concurrent renders. Kitchen-sink `/latest`, which renders a view through `ctx.renderServerModule`, serves about 870 requests per second under 64 concurrent clients, up from 29 on the same machine before.

- [#708](https://github.com/ecopages/ecopages/pull/708) [`dfa6056`](https://github.com/ecopages/ecopages/commit/dfa6056f4ecdc4afca6122ffdc1477c69a214d78) Thanks [@andeeplus](https://github.com/andeeplus)! - Merge grouped browser options and scope React entry declarations

- [#687](https://github.com/ecopages/ecopages/pull/687) [`0652cd8`](https://github.com/ecopages/ecopages/commit/0652cd811de0b0cc10d1e76f0ba4648471e08c5c) Thanks [@andeeplus](https://github.com/andeeplus)! - The component render context always uses `AsyncLocalStorage`. The in-memory stack that stood in when `node:async_hooks` could not be imported is removed; a stack cannot follow renders that overlap, and every supported runtime provides `node:async_hooks`.

- [#528](https://github.com/ecopages/ecopages/pull/528) [`4de39b5`](https://github.com/ecopages/ecopages/commit/4de39b5b5ea1a99a145df06ca1487dc808f90e52) Thanks [@andeeplus](https://github.com/andeeplus)! - Send `must-revalidate` and an ETag on HTML under the `static` Cache Strategy so browsers revalidate after a redeploy. Keep `immutable` for content-hashed asset URLs only.

- [#521](https://github.com/ecopages/ecopages/pull/521) [`e280787`](https://github.com/ecopages/ecopages/commit/e2807879e5040fc7fdc544b1f3aa197148a0a6e4) Thanks [@andeeplus](https://github.com/andeeplus)! - Reject .server module imports in core-owned browser builds with an error naming the importer, while preserving React Pages that use server imports only in pruned server options.

- [#597](https://github.com/ecopages/ecopages/pull/597) [`1870c69`](https://github.com/ecopages/ecopages/commit/1870c6902ffcfb09b5421639662f97e7710dbcea) Thanks [@andeeplus](https://github.com/andeeplus)! - Editing a source file or a processor-owned asset in development evicts only the cached pages that used it, instead of every cached page. Pages rendered by the Lit worker and pages that import the HTML template's includes now record those files, so their cached output follows them.

- [#514](https://github.com/ecopages/ecopages/pull/514) [`155f913`](https://github.com/ecopages/ecopages/commit/155f91384d7e797ee95b3b7ce93ceb4e0ddac93b) Thanks [@andeeplus](https://github.com/andeeplus)! - A server started without the CLI, with `node dist/.server/app.mjs` or `bun dist/.server/app.mjs`, now loads the config compiled into `dist/.server/` even when `eco.config.ts` is in the folder. Before, it loaded `eco.config.ts`, and Node failed at startup because it does not strip TypeScript under `node_modules`. A deploy can now copy the whole project, `eco.config.ts` included.

- [#637](https://github.com/ecopages/ecopages/pull/637) [`60589f7`](https://github.com/ecopages/ecopages/commit/60589f7f2e2f2f5e960db22ec2a58e8019311428) Thanks [@andeeplus](https://github.com/andeeplus)! - A browser build now rejects a `.server` module reached through an alias. An import such as `#db`, mapped to `./src/db.server.ts` by `package.json` `imports` or a tsconfig path, used to reach the browser bundle because only the written specifier was checked. The error names the resolved module and its importer.

- [#609](https://github.com/ecopages/ecopages/pull/609) [`ad3abc0`](https://github.com/ecopages/ecopages/commit/ad3abc050683727fd4ca90465709fbb57560d6c8) Thanks [@andeeplus](https://github.com/andeeplus)! - A handler-rendered view reuses its Integration's asset-processing service, so an unchanged stylesheet or script is reused across renders until its source changes, its output is missing, or development invalidation drops the entry. Stylesheet attributes are part of that cache identity, so two declarations of the same file with different attributes stay apart.

- [#727](https://github.com/ecopages/ecopages/pull/727) [`79d642a`](https://github.com/ecopages/ecopages/commit/79d642a423d1759b2343710909d2bdca204cada2) Thanks [@andeeplus](https://github.com/andeeplus)! - Report and use one shared concurrency limit for builds and static export.

- [#706](https://github.com/ecopages/ecopages/pull/706) [`77954a0`](https://github.com/ecopages/ecopages/commit/77954a0d5281d37cffd3ed1112581abd4da7d8d0) Thanks [@andeeplus](https://github.com/andeeplus)! - Serve exported files through the same request handler in runtime fallbacks and preview, including correct gzip negotiation and safe path handling.

- [#577](https://github.com/ecopages/ecopages/pull/577) [`306454a`](https://github.com/ecopages/ecopages/commit/306454a704babb0bcafc6c83f8fd66d2b5f6b4fb) Thanks [@andeeplus](https://github.com/andeeplus)! - In development, an edited page is always imported again with its new code, on Node and on Bun.

- [#525](https://github.com/ecopages/ecopages/pull/525) [`5998a2b`](https://github.com/ecopages/ecopages/commit/5998a2bb2e0c2686d946a30204be1902cc83228b) Thanks [@andeeplus](https://github.com/andeeplus)! - Build output is found whether an entry is identified by its path or name, even when the project root is accessed through a symlink.

- [#780](https://github.com/ecopages/ecopages/pull/780) [`6e0961e`](https://github.com/ecopages/ecopages/commit/6e0961e626bcd247621679fe0ad2363b57a2cdc0) Thanks [@andeeplus](https://github.com/andeeplus)! - - Running the app entry as `ecopages dev`, `build`, or `preview` no longer also reports the `start` command.
    - Errors about `src/includes/html.html` call it the HTML template, as the docs do.

- [#734](https://github.com/ecopages/ecopages/pull/734) [`eaee971`](https://github.com/ecopages/ecopages/commit/eaee9713018daf454b98ad6219f29e78f0cb8644) Thanks [@andeeplus](https://github.com/andeeplus)! - Restore registered Ecopages JSX page HMR and avoid duplicate public asset copies during export setup.

- [#519](https://github.com/ecopages/ecopages/pull/519) [`ee6f61c`](https://github.com/ecopages/ecopages/commit/ee6f61c88c53c34ed0c9543e9121a61af2251a21) Thanks [@andeeplus](https://github.com/andeeplus)! - Show development build errors in the Dev Toolbar with a count badge and a cancelable event contract for custom clients, preserving the in-page fallback for unclaimed errors.

- [#485](https://github.com/ecopages/ecopages/pull/485) [`343796d`](https://github.com/ecopages/ecopages/commit/343796d2e7c633bf41f952fc1264b576a2e8257f) Thanks [@andeeplus](https://github.com/andeeplus)! - Development HTML is sent with `no-store`. A stylesheet link added, changed, or removed by an edit would otherwise stay cached for a year under the default `static` strategy.

- [#541](https://github.com/ecopages/ecopages/pull/541) [`829b699`](https://github.com/ecopages/ecopages/commit/829b69950d5b8820fdb79f9bb691d3537995e91d) Thanks [@andeeplus](https://github.com/andeeplus)! - Vite no longer warns that the app config loader and Radiant SSR runtime dynamic imports cannot be analyzed. Those specifiers are resolved at runtime on purpose.

- [#541](https://github.com/ecopages/ecopages/pull/541) [`829b699`](https://github.com/ecopages/ecopages/commit/829b69950d5b8820fdb79f9bb691d3537995e91d) Thanks [@andeeplus](https://github.com/andeeplus)! - During development, edits to files used by Components, Includes, Layouts, explicit views, and discovered factory modules mark affected Pages dirty. New source files are observed even when copied with preserved timestamps, and server-source edits invalidate cached HTML documents.

    The dev server reports ready after filesystem subscriptions are active, so edits made immediately after startup are observed.

- [#489](https://github.com/ecopages/ecopages/pull/489) [`dfb5e6b`](https://github.com/ecopages/ecopages/commit/dfb5e6b5c5a065cd7c6161ff7eb4641a3ef59b1d) Thanks [@andeeplus](https://github.com/andeeplus)! - On Windows, `ecopages dev` now ignores `node_modules`, `.git`, the work directory and `distDir` again. They were watched, so a glob in `additionalWatchPaths` based at the project root, such as `**/*.config.ts`, crawled all of `node_modules`, and build output reached the change pipeline. `additionalWatchPaths` globs written with `\` separators, such as `content\**\*.md`, now watch the folder before the first wildcard.
- Updated dependencies [[`8160662`](https://github.com/ecopages/ecopages/commit/816066208a9ff738661a5591689001526965d3e6), [`1990d16`](https://github.com/ecopages/ecopages/commit/1990d16622d61feb39b3184699755f6eda579093), [`f88f71a`](https://github.com/ecopages/ecopages/commit/f88f71a597dfb825ebea89e1bf9d8c02f98440da), [`8abf88a`](https://github.com/ecopages/ecopages/commit/8abf88a25e3b8ca1a24f36864cc9ac7b1f980f33), [`bf2c0e4`](https://github.com/ecopages/ecopages/commit/bf2c0e4e14231f456cc9c7bc23edbcd63b72fbcf), [`451db72`](https://github.com/ecopages/ecopages/commit/451db7229ea4347dda001d102e85a7fbf410bd53), [`ee6f61c`](https://github.com/ecopages/ecopages/commit/ee6f61c88c53c34ed0c9543e9121a61af2251a21)]:
    - @ecopages/file-system@0.3.0
    - @ecopages/dev-toolbar@0.3.0

## 0.2.0

### Minor Changes

- [`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee) Thanks [@andeeplus](https://github.com/andeeplus)! - First stable release of the app-owned runtime. `createApp()` from `@ecopages/core/create-app` is the entrypoint: Bun when available, Node otherwise. Author-facing config is `defineConfig` and `EcoPagesUserConfig` in `eco.config.ts`. `createApp()` and the CLI load that file when you omit a config object; the CLI accepts `--config`. `rootDir` may be omitted and defaults to `process.cwd()`.

    Register an Integration for every route file type. The built-in ghtml Integration (`@ecopages/core/html`) is gone. Declare Pages, Layouts, Html, and Components with `eco.page()`, `eco.layout()`, `eco.html()`, and `eco.component()`. Nested layouts are an outer-to-inner array on `eco.page({ layout })`. Direct local Eco Component imports and relative CSS supply Dependencies by default. Filesystem discovery, matching, and static-generation planning live in `RouteRegistry`. Catch-all matching prefers the most specific discovered Page.

    Filesystem `pages/404.*` and `pages/500.*` are the highest-priority custom error pages. Semantic status pages cover 400, 401, 403, 404, 409, and 500. Explicit-route apps use `app.notFound()`, `app.serverError()`, and `app.errorPage()`. Built-in HTML documents exist when you do not author one. Valid `HttpError` statuses are preserved on HTML responses.

    Dev servers resolve port collisions through `PortManager`. Changing `eco.config` or supported `.env` files restarts supervised `ecopages dev`. HTML finalization uses one streaming rewriter on every runtime, so Node matches Bun output. `ssr: true` on `dependencies.scripts` registers custom elements on the server.

    Custom Integration authors resolve mixed-integration children with `this.resolveQueuedForeignSubtrees(...)`. Do not import `@ecopages/core/bun` or `@ecopages/core/eco`.

### Patch Changes

- Updated dependencies [[`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee), [`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee)]:
    - @ecopages/dev-toolbar@0.2.0
    - @ecopages/file-system@0.2.0

All notable changes to `@ecopages/core` are documented here.

> Changelog tracking begins at version `0.2.0`. Prerelease history lives in git tags and GitHub Releases.
