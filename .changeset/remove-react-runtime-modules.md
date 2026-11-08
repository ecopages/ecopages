---
'@ecopages/react': minor
---

Remove the `runtimeModules` option of `reactPlugin()`. A package that several Pages, Layouts or islands import is now one browser module without configuration: production builds every browser entry in one app-wide build, and development serves each package from one vendor URL. Delete `runtimeModules` from your config; the packages it listed stay shared.
