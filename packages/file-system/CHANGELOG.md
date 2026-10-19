# Changelog

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
