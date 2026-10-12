---
'@ecopages/core': minor
'ecopages': minor
---

Remove the hooks and options no plugin uses, and the `--force` flag that depended on them. `ecopages build` and `ecopages preview` render every Page from source on each run, and `ecopages build --help` now says what the build does.

**Breaking:**

- `ecopages build --force` and `ecopages preview --force` fail as unknown options. Remove the flag; the build never reused earlier output in a new process, so the result is the same.
- `didChange()` is gone from `Processor` and `IntegrationPlugin`. No shipped plugin overrode it; remove your override.
- `runtimeCapability`, `RuntimeCapabilityDeclaration` and `RuntimeCapabilityTag` are gone from `Processor`, `IntegrationPlugin` and their configs, and config finalization no longer validates them. Remove the declaration.
- `afterStaticExport` is gone from `IntegrationPlugin`. Remove the hook; `beforeStaticExport` stays. With `sitemap.enabled`, `sitemap.xml` is still written after every page.
- The `onLoad` callback of a build plugin no longer receives `addDependency`. Remove the call; core records the loaded path.
- `EcoBuildLoader` is `js`, `jsx`, `ts`, `tsx` or `object`. A plugin that returned another kind, such as `css`, `json` or `text`, now gets the module type of its file extension; return `js` source or `object` exports instead.
- `Processor.teardown()`, `IntegrationPlugin.options` and `ProcessorConfig.description` are gone. Remove the override, the `options` access and the `description` you pass. Integration `teardown()` stays and core still calls it.
