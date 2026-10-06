---
'@ecopages/core': minor
'@ecopages/content-processor': minor
'@ecopages/image-processor': minor
'@ecopages/postcss-processor': minor
---

Build requests now declare a server or browser environment. Integrations and Processors use one plugins getter with environment selection; duplicate plugin names in the same environment fail during configuration. Move browserBuildPlugins or buildPlugins contributions to plugins with environments: [browser], and pass server or browser to getTranspileOptions.
