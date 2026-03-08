# Changelog

All notable changes to `@ecopages/image-processor` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- **`image-plugins.ts`** — New file extracting image processing plugin logic for reuse across build adapters (`image-plugins.ts`).
- Bun-specific plugin helpers moved to `bun-plugins.ts`, separating runtime concerns from the image processing core.

### Refactoring

- `plugin.ts` updated to use the new `image-plugins.ts` abstraction.
- `image-processor.ts` minor updates.
- README updated with usage clarification.

### Tests

- `image-renderer.test.ts` expanded (68 lines added).
- `image-processor.test.ts` and `image-utils.test.ts` updated.
