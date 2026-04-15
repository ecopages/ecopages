# Changelog

## [UNRELEASED] -- TBD

### Features

- Added `@ecopages/ecopages-jsx` integration plugin for server-side JSX rendering via `@ecopages/jsx`
- Added optional `radiant` option (default `true`) to include `@ecopages/radiant` and `@ecopages/signals` vendor bundles; set to `false` for pages that do not use Radiant web components
- Added optional MDX support via `@mdx-js/mdx` compile() when `mdx.enabled: true`
- Added `jsxImportSource: '@ecopages/jsx'` pragma propagation to both SSR and MDX compile pipelines

### Bug Fixes

- Fixed full route and `renderToResponse()` JSX rendering to stay on the renderer-owned explicit path and preserve nested child HTML without routing through shared marker finalization.
- Fixed the package contract to require the `@ecopages/radiant` peer dependency because the default JSX integration path depends on Radiant runtime assets.
- Fixed custom Ecopages JSX MDX extension matching to escape full multi-dot extensions in both esbuild and Bun loader filters.
- Fixed the kitchen-sink Ecopages JSX demo to use the shared light-DOM `radiant-counter` host so mixed routes render without leaking Radiant shadow-root SSR behavior into Lit pages.
- Fixed Radiant browser bundles to publish the `@ecopages/jsx/server` import-map entry required by the vendored `@ecopages/radiant` runtime.
- Fixed Ecopages JSX browser bundles to rewrite emitted `@ecopages/jsx` and `@ecopages/radiant` runtime imports to vendor asset URLs and avoid mapping server-only Radiant subpaths into the browser runtime.
- Fixed the vendored Radiant browser runtime to emit exports from curated public subpaths instead of the package root surface.
- Fixed MDX setup to register Bun-only loader hooks only when the integration is running on Bun.
- Fixed deferred template serializer registration to live on the JSX renderer instead of a side-effect bootstrap module.

### Documentation

- Updated the README to document JSX route extensions, Radiant defaults, MDX configuration, and mixed-renderer boundary ownership.
