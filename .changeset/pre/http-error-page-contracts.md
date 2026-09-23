---
'@ecopages/core': minor
---

Preserve valid 4xx and 5xx `HttpError` statuses on HTML page-pipeline responses, normalizing out-of-range values to 500. Semantic pages now cover 400, 401, 403, 404, 409, and 500 (`pages/{status}.*`, `app.errorPage()`, and named helpers), with built-in documents when no custom page exists.
