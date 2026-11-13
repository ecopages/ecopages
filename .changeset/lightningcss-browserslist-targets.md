---
'@ecopages/lightningcss-processor': minor
---

`lightningCssProcessorPlugin()` now lowers CSS for the app's browserslist config when `targets` is not set: a `.browserslistrc`, or the `browserslist` field of `package.json`, found from the app root. An app with such a config gets lowered CSS it did not get before; an app without one is unchanged. An explicit `targets` still wins, and `targets: false` keeps lowering off.
