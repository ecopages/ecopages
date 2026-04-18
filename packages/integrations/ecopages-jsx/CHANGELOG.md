# Changelog

## [UNRELEASED] -- TBD

### Features

- Added the Ecopages JSX integration with optional Radiant runtime support and optional MDX routes compiled against `@ecopages/jsx`.

### Bug Fixes

- Fixed Radiant SSR page inspection to install the light-DOM shim before JSX page modules are imported outside the normal render pass.
- Restored direct `EcopagesJsxPlugin` construction so the exported class still accepts the public plugin options shape.
- Fixed intrinsic custom-element asset discovery so Ecopages JSX registers scripts declared with decorator and function-call `customElement(...)` syntax.
- Fixed the Ecopages JSX browser runtime import map so browser builds no longer expose `@ecopages/jsx/server` through the shared JSX vendor bundle.
- Fixed the Ecopages JSX browser runtime bundle so Radiant custom-element scripts no longer fail on a duplicate `jsxDEV` export cycle.

### Refactoring

- Replaced Ecopages JSX renderer static and post-construction configuration with instance-owned renderer wiring and extracted shared plugin and renderer types into a dedicated module.
