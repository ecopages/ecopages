# Changelog

All notable changes to `@ecopages/image-processor` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Extracted shared image plugin creation into `image-plugins.ts` so the processor can target multiple build adapters.

### Bug Fixes

- Switched public internal imports to explicit relative ESM specifiers so Node thin-host builds can externalize the package without `ERR_MODULE_NOT_FOUND`.
- Inlined the generated `ecopages:images` declaration source so bundled runtime bootstrap no longer depends on a sibling `types` module at runtime.
- Re-emitted generated image outputs after static export cleanup so routes that reference `/images/...` keep their optimized files inside `dist`.

### Refactoring

- Moved Bun-specific helpers into `bun-plugins.ts` and aligned the plugin implementation with the shared image plugin layer.

### Tests

- Updated image processor and renderer coverage for the current build pipeline.
