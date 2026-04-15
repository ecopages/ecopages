# Changelog

All notable changes to `@ecopages/mdx` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added standalone MDX server rendering and async compilation support.

### Bug Fixes

- Fixed `.md` opt-in handling, loader registration, and Node `source-map` interop.
- Fixed full route and explicit MDX view rendering to stay on the renderer-owned page/layout/document component path for deferred mixed-integration boundaries.

### Refactoring

- Removed the React-specific renderer and HMR path from the package.

### Documentation

- Updated the README for standalone non-React MDX usage, `.md` opt-in handling, and compiler configuration.

---

## Migration Notes

- Register `@ecopages/mdx` and `@ecopages/react` separately when you want MDX server rendering together with React client hydration.
- The previous React-specific MDX path, including `useReact` and the React-specific HMR hooks, has been removed.
