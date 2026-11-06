---
'@ecopages/core': patch
---

Fix foreign-JSX files (for example `.kita.tsx`) in a React client graph skipping the React client-graph boundary. The foreign-JSX override is now a `transform` rather than an `onLoad`, so it composes with the boundary and server-only imports in those files are stripped before the browser build.
