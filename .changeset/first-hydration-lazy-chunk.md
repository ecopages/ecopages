---
'@ecopages/react': minor
'@ecopages/react-router': minor
---

Document that a failed `React.lazy` chunk during first hydration is not retried by a document reload. Reloading there would loop for as long as the failure lasts. A Page-level error boundary around the entry still catches first.
