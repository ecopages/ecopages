# Error pages

This directory owns semantic HTML error-page behavior shared by request-time rendering and static export.

## Status taxonomy

`errors/http-error-page-contract.ts` classifies page-pipeline failures. This service only selects the document.

Factory statuses and their pages:

| Status | Kind           | Filesystem    | App API              |
| ------ | -------------- | ------------- | -------------------- |
| 400    | `badRequest`   | `pages/400.*` | `app.badRequest()`   |
| 401    | `unauthorized` | `pages/401.*` | `app.unauthorized()` |
| 403    | `forbidden`    | `pages/403.*` | `app.forbidden()`    |
| 404    | `notFound`     | `pages/404.*` | `app.notFound()`     |
| 409    | `conflict`     | `pages/409.*` | `app.conflict()`     |
| 500    | `serverError`  | `pages/500.*` | `app.serverError()`  |

Unmatched URLs are 404. Generic `Error` is 500. Non-factory 4xx uses a built-in document with that status. Non-factory 5xx reuses the server-error page, including its built-in fallback, with the original status. `HttpError` values outside the valid 400–599 error range normalize to 500. `app.get()` / `app.onError()` never enter this directory.

`FileSystemResponseMatcher.renderPageFailure()` is the shared classifier for filesystem pages and explicit static routes.

## Files

- `error-page-renderer.ts` applies filesystem → registered-loader → built-in precedence. Registered pages reuse `prepareExplicitStaticRender`. Callers that need a guaranteed built-in document after a custom-page failure use `renderBuiltIn()`. Static export asks `resolveSourceFile()` before rendering so unchanged sources can skip work.
- `default-error-pages.ts` renders self-contained fallback documents from a normalized view model. Development 5xx pages include diagnostics and a copy control with copied and failed states; production documents never serialize diagnostics.
- `semantic-error-page-exporter.ts` writes `/{status}.html` for every factory status during static export.

Runtime adapters only wrap the rendered body in an HTTP response; they do not decide error-page source precedence.
