# Changelog

All notable changes to `@ecopages/mdx` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Added standalone MDX server rendering and async compilation support.

### Bug Fixes

- Fixed `.md` opt-in handling, loader registration, and Node `source-map` interop.

### Refactoring

- Removed the React-specific renderer and HMR path from the package.

### Documentation

- Updated the README for standalone MDX registration and the current integration setup.

---

## Migration Notes

- Register `@ecopages/mdx` and `@ecopages/react` separately when you want MDX server rendering together with React client hydration.
- The previous React-specific MDX path, including `useReact` and the React-specific HMR hooks, has been removed.
