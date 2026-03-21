# Changelog

All notable changes to `@ecopages/mdx` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- Made the MDX integration standalone so MDX routes can server-render without requiring the React integration.
- Switched MDX compilation to the async pipeline for async remark and rehype plugin support.

### Bug Fixes

- Fixed configured `.md` extensions to compile as MDX instead of plain markdown so top-level `import` and `export` statements work when `.md` is opted in.
- Fixed loader registration to respect configured extensions so standalone MDX no longer hijacks React `.mdx` pages during shared development and build flows.
- Fixed native Node startup compatibility by using Node-safe `source-map` interop.

### Refactoring

- Removed the React-specific renderer and HMR code from the package and aligned MDX with the unified orchestration pipeline.

### Documentation

- Updated the README for standalone MDX registration and the current integration setup.

---

## Migration Notes

- Register `@ecopages/mdx` and `@ecopages/react` separately when you want MDX server rendering together with React client hydration.
- The previous React-specific MDX path, including `useReact` and the React-specific HMR hooks, has been removed.
