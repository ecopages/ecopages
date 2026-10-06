---
'@ecopages/core': minor
'@ecopages/ecopages-jsx': minor
'@ecopages/lit': minor
'@ecopages/mdx': minor
'@ecopages/react': minor
---

Remove the `rendererModules` option from Integration renderers. No host passed it, so renderers always used the app's `html` template and added no island client script; that stays the behaviour.

**Breaking:** `initializeRenderer()` on Integration plugins takes no arguments, and renderer constructors no longer accept `rendererModules`. Drop the option where a custom Integration passes it or overrides `initializeRenderer(options)`.
