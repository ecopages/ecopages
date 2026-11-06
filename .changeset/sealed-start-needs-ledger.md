---
'@ecopages/core': patch
'@ecopages/postcss-processor': patch
---

`ecopages start` now fails with "Run `ecopages build` again" when `dist/server/processed-assets.json` is missing, instead of starting unsealed and processing assets at request time. The PostCSS processor drops its runtime CSS loader, which shadowed the build loader in browser builds, so every stylesheet a browser build imports is processed by PostCSS.
