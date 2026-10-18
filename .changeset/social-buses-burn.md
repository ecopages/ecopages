---
'@ecopages/core': minor
'@ecopages/content-processor': minor
'@ecopages/image-processor': minor
'@ecopages/postcss-processor': minor
---

Build requests declare a server or browser environment. The React, MDX, and Ecopages JSX Integrations, and the Content, Image, and PostCSS Processors, contribute bundler plugins through `plugins` with environment selection. Duplicate plugin names in the same environment fail during configuration.

**Breaking:** Custom Integrations must move `browserBuildPlugins` contributions to `plugins` with `environments: ['browser']`; custom Processors must do the same for `buildPlugins`. Replace transpile profile arguments with the `server` or `browser` environment.
