---
'@ecopages/core': minor
---

Remove `ConfigBuilder` and the `@ecopages/core/config-builder` subpath. Configs are authored with `defineConfig({ ... })`, and `finalizeEcoPagesConfig()` from `@ecopages/core/config` is the only finalizer; `createApp()` and `loadEcoPagesConfig()` call it for you. Validation and defaults are unchanged.

**Breaking:**

- An `eco.config.ts` that exports `await new ConfigBuilder()...build()` no longer loads, and the loader no longer accepts a finalized config as the default export. Export `defineConfig({ ... })` instead. Most setters map to the field of the same name (`setIntegrations([...])` becomes `integrations: [...]`). The exceptions:
    - `setCacheConfig()` becomes `cache`.
    - `addProcessor()`, `addLoader()`, and `addSourceTransform()` become entries in `processors`, `loaders`, and `sourceTransforms`, keyed by each entry's `name`. Registering under a different key is no longer possible.
    - `setConfigModulePath()` has no field; the loader records the module path itself, and `finalizeEcoPagesConfig()` takes it as the `configFilePath` option.
- `finalizeEcoPagesConfig()` takes the user config first: `finalizeEcoPagesConfig(userConfig, { configFilePath, buildOwnership, cwd })` replaces `finalizeEcoPagesConfig({ config, configFilePath }, options)`. `configFilePath` defaults to `<rootDir>/eco.config.ts`.
- `finalizeEcoPagesConfig()` throws when given an already finalized config.
- `CONFIG_BUILDER_ERRORS` is removed. The error messages are the same.
