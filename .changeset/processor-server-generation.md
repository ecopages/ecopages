---
'@ecopages/core': minor
'@ecopages/content-processor': minor
---

Core no longer tells Processors to drop compiled server artifacts. The content processor compares the app module loader's development generation with the one its compiled collection bundle was built at, and rebuilds the bundle on the next request after any server source edit, such as a component an entry imports.

**Breaking:**

- `Processor.invalidateServerArtifacts()` is gone, and `DevelopmentInvalidationService.invalidateServerModules()` no longer calls it. A Processor that keeps compiled server output outside the route-module graph reads `appConfig.runtime.appModuleLoader.getDevelopmentGeneration()`, which advances on every server source edit, and rebuilds when it differs from the generation the output was built at.
