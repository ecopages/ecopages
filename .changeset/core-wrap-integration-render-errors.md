---
'@ecopages/core': minor
'@ecopages/react': minor
'@ecopages/ecopages-jsx': minor
---

Route render errors are wrapped only by core, as `Error rendering page`, keeping the original error as `cause` and passing an `HttpError` through. React no longer prefixes `Failed to render component`; Ecopages JSX no longer prefixes `Error rendering component`.
