---
'@ecopages/core': minor
---

Remove `ConfigBuilder` and the `@ecopages/core/config-builder` subpath. Author `eco.config.ts` with `defineConfig({ ... })` from `@ecopages/core/config`; `createApp()` loads and finalizes it. Validation and defaults are unchanged.

**Breaking:** an `eco.config.ts` that exports `await new ConfigBuilder()...build()` no longer loads. Export `defineConfig({ ... })` instead. Most setters map to the field of the same name (`setIntegrations([...])` becomes `integrations: [...]`). The exceptions:

- `setCacheConfig()` becomes `cache`.
- `addProcessor()`, `addLoader()`, and `addSourceTransform()` become entries in `processors`, `loaders`, and `sourceTransforms`, keyed by each entry's `name`.
- `setConfigModulePath()` is gone; Ecopages records the config file path itself.
- `FinalizeEcoPagesConfigOptions` is no longer exported from `@ecopages/core/config`. The exported `finalizeEcoPagesConfig()` function still accepts inline `{ configFilePath, cwd }` options; `LoadEcoPagesConfigOptions` configures `loadEcoPagesConfig()`.

`createApp()` and `loadEcoPagesConfig()` still load and finalize config automatically.
