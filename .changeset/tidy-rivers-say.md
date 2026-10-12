---
'@ecopages/core': minor
'@ecopages/react': minor
---

**Breaking:** Remove layout runtime scanning. `LayoutOptions.runtimeProvider` is removed, and layout files no longer add npm packages to the shared vendor bundles. Migrate by deleting `runtimeProvider` from layouts and listing each shared package in `reactPlugin({ runtimeModules })` using the exact specifier that app code imports.
