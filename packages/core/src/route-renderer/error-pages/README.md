# Error pages

**Layer:** Rendering.

This directory owns semantic error-page behavior for HTTP statuses 400, 401, 403, 404, 409, and 500, shared by request-time rendering and static export. Other 5xx statuses use the server-error page; other 4xx statuses use a built-in document.

- `error-page-renderer.ts` applies filesystem → registered-loader → built-in precedence. A semantic template still counts as filesystem when the source is gone and `ecopages build` recorded it in the server-modules map. Registered views reuse `prepareExplicitStaticRender`. Callers that need a guaranteed built-in document after a custom-page failure use `renderBuiltIn()`.
- `default-error-pages.ts` renders self-contained fallback documents with development-only diagnostics. The development stack includes the stack of every wrapped `cause`, so a render or import failure shows the original error; production pages never include a stack.
- `semantic-error-page-exporter.ts` writes one artifact for each semantic status pathname during static export, unless another generated route already owns that pathname.

The renderer owns custom-source precedence and fallback documents. Runtime adapters classify route failures, coordinate fallback after a rendering failure, and wrap the final body in an HTTP response.
