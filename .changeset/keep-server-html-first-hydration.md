---
'@ecopages/react': minor
'@ecopages/react-router': minor
---

Keep the server HTML when a `React.lazy` chunk fails during first hydration. Hydration is skipped and the chunk is not retried. A Page-level error boundary around the entry still catches first and shows its fallback.
