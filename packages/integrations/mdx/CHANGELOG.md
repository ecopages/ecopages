# Changelog

All notable changes to `@ecopages/mdx` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added standalone non-React MDX server rendering with async compilation and opt-in `.md` support.

### Bug Fixes

- Fixed loader registration, Node `source-map` interop, and renderer-owned mixed-boundary rendering for standalone MDX routes.
- Fixed standalone MDX boundary payload compatibility coverage and removed the plugin/renderer integration-name import cycle.

### Documentation

- Updated the README for standalone non-React MDX usage, `.md` opt-in handling, and compiler configuration.

### Tests

- Added renderer-level coverage for the boundary payload compatibility contract.

### Refactoring

- Replaced the standalone MDX renderer factory with explicit renderer-owned compiler configuration and collected shared MDX plugin and renderer types into a dedicated module.

---

## Migration Notes

- Use `reactPlugin({ mdx: { enabled: true } })` for React-backed MDX routes; the standalone `@ecopages/mdx` plugin now targets non-React JSX runtimes.
