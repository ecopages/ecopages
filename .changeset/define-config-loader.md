---
'@ecopages/core': minor
'@ecopages/ecopages': minor
'@ecopages/vite-plugin': minor
---

Add Vite-shaped `defineConfig` and async config loading from `eco.config.ts`. `createApp()` and `ecopages()` load the config when omitted; the CLI accepts `--config`, and production server bundles emit and load `dist/.server/eco.config.mjs`. Author-facing config is `EcoPagesUserConfig` only.
