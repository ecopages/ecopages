---
'@ecopages/core': patch
'@ecopages/ecopages-jsx': patch
---

Vite no longer warns that the app config loader and Radiant SSR runtime dynamic imports cannot be analyzed. Those specifiers are resolved at runtime on purpose.
