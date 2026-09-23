# Error pages

This directory owns semantic 404/500 page behavior shared by request-time rendering and static export.

- `error-page-renderer.ts` applies filesystem → registered-loader → built-in precedence. Registered views reuse `prepareExplicitStaticRender`. Callers that need a guaranteed built-in document after a custom-page failure use `renderBuiltIn()`. Static export asks `resolveSourceFile()` before rendering so unchanged sources can skip work.
- `default-error-pages.ts` renders self-contained fallback documents with development-only diagnostics.
- `semantic-error-page-exporter.ts` writes `/404.html` and `/500.html` exactly once during static export.

Runtime adapters only wrap the rendered body in an HTTP response; they do not decide error-page source precedence.
