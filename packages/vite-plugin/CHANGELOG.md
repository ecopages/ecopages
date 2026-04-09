# @ecopages/vite-plugin

## [UNRELEASED] - TBD

### Features

- Added composed Vite plugin surface extracted from the kitchen-sink-nitro playground
- Added host-agnostic `ecopages()` entrypoint that returns an array of Vite plugins for config merging, virtual modules, source transforms, island registration, metadata injection, JSX compatibility, HMR, and host-bridge integration
- Added `@ecopages/vite-plugin/nitro` sub-export with `createNitroBridgeConfig()`, `normalizeHtmlResponse()`, and Nitro host module loader utilities
