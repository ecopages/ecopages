---
'@ecopages/core': minor
'@ecopages/file-system': minor
'@ecopages/lit': patch
'@ecopages/ecopages-jsx': patch
ecopages: patch
---

`createApp()` always uses the Node HTTP host. A Bun process still logs `Bun server running at`, because that line names the runtime that launched the process.

On Bun, `ssr: true` scripts in `dependencies.scripts` now load through the same server build as on Node, so their CSS, MDX and image imports resolve as they do on Node. A Lit SSR script the asset pipeline cannot build is reported as a failed SSR preload instead of being imported from source.

Ecopages packages no longer add Bun's global types to a TypeScript compilation, and the `ecopages` CLI no longer lists `bun-types` as a peer dependency.

**Breaking:**

- `createApp({ adapter })` is removed. There is no Bun adapter and no `adapter: 'auto'`.
- `createApp()` no longer takes a WebSocket data type argument.
- On Bun, `serverOptions` no longer reach `Bun.serve`. Only `port` and `hostname` are read, so Bun-only keys such as `tls` and `idleTimeout` are ignored.
- An app that uses the `Bun` global or `import.meta.env` and got their types through an Ecopages package must install `@types/bun` itself. `@ecopages/core/env` no longer extends `Bun.Env`; read `ECOPAGES_*` variables from `process.env`, which works on Node and Bun.
- `CustomElementScriptPreloader` requires `importServerModule`, and its `preferSourceImports` and `resolvePreloadEntrypoint` options are removed. `createCustomElementSsrPreloadEntrypointResolver` is replaced by `createCustomElementSsrPipelineImporter`, which imports the pipeline output itself.
- `resolveRequestPipelineRuntime` is removed from `@ecopages/core/diagnostics/request-pipeline-metrics`.
