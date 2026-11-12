# Changelog

## 0.7.1

No changes in this release.

## 0.7.0

### Minor Changes

- [#1137](https://github.com/ecopages/ecopages/pull/1137) [`e7a129b`](https://github.com/ecopages/ecopages/commit/e7a129ba19003015bad6e64d40b191a46276273c) Thanks [@andeeplus](https://github.com/andeeplus)! - Require Node.js `^24.22.0 || >=26.0.0`, declared in `engines.node`. Node 24 releases before 24.22 and Node 25 are no longer supported, because older Node 24 releases report file deletions unreliably in the Linux recursive watcher. Upgrade Node.js before updating.

- [#1071](https://github.com/ecopages/ecopages/pull/1071) [`a763a03`](https://github.com/ecopages/ecopages/commit/a763a036b9dc7831cc5eb26b60080f7781d417b2) Thanks [@andeeplus](https://github.com/andeeplus)! - Add `@ecopages/file-system/path`, path operations that always return forward slashes, with converters from native paths and `file:` URLs. `fileSystem.realpath`, `glob`, `readdir`, `readlink`, `mkdtemp` and watcher events now return paths in that form on Windows.

    Ecopages now holds every path in that form, so on Windows paths no longer leak backslashes into URLs, cache keys and generated imports, and a separator difference no longer breaks a path comparison. On Windows, resolved config paths (`rootDir` and `absolutePaths.*`) and the paths build plugins receive in `onResolve`, `onLoad` and `transform` are now forward-slash paths such as `D:/app/src/page.tsx`. A server build with `preserveModules` also names a module on another drive than its root instead of failing.

- [#1100](https://github.com/ecopages/ecopages/pull/1100) [`eea38b2`](https://github.com/ecopages/ecopages/commit/eea38b2b330dd937d96e16cb4078d8da3b64dc26) Thanks [@andeeplus](https://github.com/andeeplus)! - Core now owns the development lifecycle of stylesheets, and a stylesheet Processor only transforms them.

    Breaking: `Processor.transformStylesheet(css, file)` returns `{ css, dependencies }` instead of a string. `dependencies` lists the absolute paths of the other files the transform read, such as the partials an `@import` inlined, and core keeps the stylesheets among them; take them from the transform (PostCSS `dependency` messages, Lightning CSS `dependencies`). To migrate a custom Processor, return `{ css }` where it returned the CSS string, and add `dependencies` when it inlines other files.

    - An edit to an `@import` partial rebuilds the stylesheets that inline it, whatever the form of the import (`layer()`, a media query, an unquoted `url()` or an alias). Their links refresh, modules that import them as text hot-update with the new CSS, and server modules that embed them, as for Lit SSR, are rebuilt.
    - A stylesheet Processor may implement `invalidateStylesheets(files)` to name the stylesheets a change to other files makes stale, or `'all'`. The PostCSS Processor uses it to recreate its plugins and rebuild `dependencyEntryPaths` (every entry when unset) after an edit to any file that is not a stylesheet, so Tailwind still finds new classes.
    - `writeSourceRelativeStylesheet` and `SourceRelativeStylesheetDirs` are no longer exported from `@ecopages/core/processor`, since core writes processed stylesheets itself.
    - `@ecopages/core/processor/contract` exports `stylesheetProcessorContract`, the cases a stylesheet Processor must pass.
    - `@ecopages/postcss-processor` no longer prewarms, caches, writes or broadcasts stylesheets itself and has no default `watch`. `PostCssProcessor.processPath`, `PostCssProcessor.processStringOrBufferSync`, `getFileAsBuffer` and the `ProcessPath` and `ProcessStringOrBufferSync` types are removed; use `PostCssProcessor.processStringOrBuffer`, or `transformWithPostcss` for the CSS with its dependencies. The package `main` and `types` now point at `src/index.ts`.
    - `@ecopages/file-system` adds `fileSystem.tempDir()`, the operating system's directory for temporary files.

- [#1059](https://github.com/ecopages/ecopages/pull/1059) [`507dca2`](https://github.com/ecopages/ecopages/commit/507dca219ea88f97bb864b0bf4c50db2c9b0456a) Thanks [@andeeplus](https://github.com/andeeplus)! - Keep serving the last good vendor output when a dev vendor-graph build fails as a whole, keep every entry in `dev-vendor-entries.json`, rebuild vendors after a package install without a restart, and build the new bare imports of one module in a single vendor build.

    `FileStats`, returned by `stat()` and `lstat()`, gains a required `mtimeMs` field; a custom `FileSystem` implementation must now return it.

## 0.6.1

No changes in this release.

## 0.6.0

### Minor Changes

- [#922](https://github.com/ecopages/ecopages/pull/922) [`6c6a6bf`](https://github.com/ecopages/ecopages/commit/6c6a6bf1f58aa14d43f370b27f03a3be8b20f8f8) Thanks [@andeeplus](https://github.com/andeeplus)! - Production `ecopages start` loads its routes and server modules from `dist/` and `node_modules/`. The build writes the filesystem route list into `dist/server/routes.json`; start loads that list and does not scan source Pages or compare source fingerprints. Start does not copy the source public directory into `dist/`; the build already did. The deploy manifest no longer records the source config path or hash. Start, through `ecopages start` or `node dist/server/app.mjs`, checks that `dist/` is complete (one build id, every listed output exists, the route list present). Production server output leaves `import.meta` pointing at the emitted files.

    This is a breaking change: a deploy that relied on source Pages at startup, source config identity checks, or production `import.meta` pointing at source files will fail. Declare files a production module reads next to itself in `serverFiles`, or move them to `public/`.

- [#928](https://github.com/ecopages/ecopages/pull/928) [`ea0d42d`](https://github.com/ecopages/ecopages/commit/ea0d42d4eb0368bfd2d93e5bb5e8a706d32eaa95) Thanks [@andeeplus](https://github.com/andeeplus)! - Use native recursive filesystem watchers, support adding paths to a running watch, report directory changes, and handle missing watch roots. When a native event omits its filename, reconcile the root and may emit rescan events for mapped requested roots; the Project Watcher coalesces them into a runtime restart request. Native events are coalesced for 50 ms, so a change may be reported while a file is still being written. If registration through `add()` fails, the new paths are rolled back so the same paths can be retried. Permission-denied children are skipped during indexing so accessible siblings remain watched. Remove Chokidar from file-system and core.

### Patch Changes

- [#931](https://github.com/ecopages/ecopages/pull/931) [`6b8b8ac`](https://github.com/ecopages/ecopages/commit/6b8b8acf46f0853930aeb25370bce38674ef623e) Thanks [@andeeplus](https://github.com/andeeplus)! - `watch()` no longer descends into subtrees its `ignored` predicate ignores without stats, so on Linux a recursive root does not open kernel watches for `node_modules` and similar folders. A directory removed while it is being indexed is treated as gone instead of reported as a watcher error, a directory found after `close()` opens no new native watcher, and a folder allowed by a later `add()` reports its changes. The development watcher also reports a build input recorded after startup when it lies under an additional watch path base, and production start rejects an unreadable browser client manifest instead of starting without it.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.2

### Patch Changes

- [#823](https://github.com/ecopages/ecopages/pull/823) [`4026351`](https://github.com/ecopages/ecopages/commit/40263519401705b54e90efc8ce93c2bf70cdb9e5) Thanks [@andeeplus](https://github.com/andeeplus)! - Add `stat`, `lstat`, `readdir`, `readlink`, `mkdtemp` and `rename`. `stat`, `lstat` and `readdir` report whether a path is a file, a directory or a symbolic link (and its size for stats); `readdir` can list subdirectories too. A missing path throws an error whose `code` is `ENOENT`. When `write` or `writeAsync` fails, the thrown error keeps the original error as its `cause`, so its `code` stays reachable.

## 0.3.1

### Patch Changes

- [#788](https://github.com/ecopages/ecopages/pull/788) [`d7a5bee`](https://github.com/ecopages/ecopages/commit/d7a5bee78fc670398b50b5da215c5d91cdccddbd) Thanks [@andeeplus](https://github.com/andeeplus)! - A build error from one file in a multi-file save now stays visible instead of being cleared by the hot update of another file in the same save. A hot update that cannot be applied, for example because a module throws when it is evaluated, now reloads the page instead of leaving a stale page. The file system toolkit gains `realpath`, and the workspace package watcher uses it instead of `node:fs`.

## 0.3.0

### Minor Changes

- [#579](https://github.com/ecopages/ecopages/pull/579) [`8160662`](https://github.com/ecopages/ecopages/commit/816066208a9ff738661a5591689001526965d3e6) Thanks [@andeeplus](https://github.com/andeeplus)! - `fileSystem.watch(paths, { onChange, onError, ignored })` watches files and directories recursively and reports each added, changed or removed file. An ignored directory is never read.

- [#574](https://github.com/ecopages/ecopages/pull/574) [`8abf88a`](https://github.com/ecopages/ecopages/commit/8abf88a25e3b8ca1a24f36864cc9ac7b1f980f33) Thanks [@andeeplus](https://github.com/andeeplus)! - File system calls and content hashes use the Node implementation on every runtime. A path now has one component id on Node and on Bun.

    **Breaking:**

    - `BunFileSystem`, `bunFs`, and the `@ecopages/file-system/bun` export are removed. `fileSystem` is `NodeFileSystem`.
    - `rapidhash` no longer calls `Bun.hash`. It uses the SHA-256 prefix on every runtime, so ids generated on Bun change.

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

## 0.2.0

### Patch Changes

- [`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee) Thanks [@andeeplus](https://github.com/andeeplus)! - Node globbing uses `node:fs/promises.glob()`.

All notable changes to `@ecopages/file-system` are documented here.

> Changelog tracking begins at version `0.2.0`. Prerelease history lives in git tags and GitHub Releases.
