# Changelog

All notable changes to `@ecopages/mdx` are documented here.

> **Note:** Changelog tracking begins at version `0.2.0`. Changes prior to this release are not recorded here but are available in the git history.

## [UNRELEASED] — TBD

### Features

- **Decoupled from React** — The MDX integration now works as a standalone, runtime-agnostic integration. React dependencies have been removed; MDX routes are server-rendered without requiring the React integration (`4d5474a4`).
- **Async MDX compilation** — The MDX loader plugin now compiles MDX files asynchronously, improving compatibility with async remark/rehype plugins (`9e879dbe`).
- **Updated type definitions** — Plugin options are more precisely typed to clarify server-rendered MDX route configuration.

### Refactoring

- Removed unused HMR strategy and renderer files that were React-specific.
- README updated to document standalone MDX usage without React.
- Ambient module declarations cleaned up (`5f46ecc5`).
- Aligned with full orchestration mode (`fc07bdb0`).

### Documentation

- README updated to clarify the integration is now usable without the React integration.

---

## Migration Notes

- If you were using `@ecopages/mdx` together with `@ecopages/react` for MDX routes, the two integrations must now be registered separately. MDX handles server rendering; React handles client hydration.
- The `useReact` option and React-specific HMR hooks have been removed.
