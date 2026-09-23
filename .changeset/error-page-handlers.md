---
'@ecopages/core': minor
---

Add `app.notFound()` and `app.serverError()` view loaders for explicit-route apps, keep filesystem `pages/404.*` and `500.*` as the highest-priority custom error pages, and ship built-in HTML 404/500 defaults with `eco-error-page*` class hooks (development 500 copy button swaps to a check icon, shows “Copied”, and resets). String and URL view registrations load through the server-module transpiler (fixes missing component identity when using raw dynamic `import()`); direct registrations are canonical and the redundant `app.viewModule()` wrapper is removed.
