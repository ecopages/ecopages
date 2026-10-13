---
'@ecopages/core': patch
---

Two renders that overlap and share a component with lazy client scripts both keep its lazy entries. Resolving the lazy triggers of one render no longer takes the pending entries away from the other, which could leave its page without the lazy scripts.
