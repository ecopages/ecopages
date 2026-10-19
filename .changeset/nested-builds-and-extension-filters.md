---
'@ecopages/core': patch
---

A build that another build waits for, such as a content collection bundle, now starts at once even when it is itself waiting on such a build, so chained collection builds no longer hang on machines with two cores.

Foreign JSX handling now matches multi-dot extensions such as `.kita.tsx` exactly, and an app whose Integrations own no `.ts`, `.tsx`, `.js` or `.jsx` extension, such as an MDX and HTML app, no longer runs component identity attribution on every module, `node_modules` included.
