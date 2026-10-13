---
'@ecopages/core': minor
---

The deploy manifest of a server bundle, `dist/.server/manifest.json`, holds relative paths only, so a bundle built in one directory and moved to another starts with `ecopages start` there. It no longer records the build machine's `distDir`, source config path, or build time. `ecopages start` and the app share one lookup for the server entry, exported as `resolveProductionServerEntry` from `@ecopages/core/config`, and `resolveEcoConfigPath` and `resolveEmittedEcoConfigPath` take the app's `distDir` instead of assuming `dist`.

**Breaking:**

- `assertProductionConfigIdentity` takes the project root as its first argument; passing a finalized app config is no longer supported. Pass `appConfig.rootDir`, and `{ distDir: appConfig.distDir }` when the app sets one.
- `manifest.json` loses `distDir`, `builtAt` and `sourceConfigPath`. Tools that read it should resolve `serverEntry` and `emittedConfigModule` against `dist/.server/` and `sourceConfigRelativePath` against the project root.
