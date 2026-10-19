---
'@ecopages/lit': patch
---

A Lit page that throws an HTTP error such as not-found now responds with that status instead of 500 when it renders in the static render worker.
