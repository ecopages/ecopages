---
'@ecopages/react': minor
---

Put the server HTML back when the React Page root fails on the first-loaded Page, such as a `React.lazy` chunk that fails to load while the Page hydrates. React tears the root down and would leave the body empty; the restored Page is readable but no longer interactive, the chunk is not retried, and in development the next edit to the Page reloads the document. This covers any uncaught error on that Page until it re-renders or the router has navigated. A Page-level error boundary around the entry still catches first and shows its fallback. The component stack of the uncaught error is logged.
