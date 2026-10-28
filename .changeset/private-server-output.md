---
'@ecopages/core': patch
---

Production serving and preview never serve files from the private `dist/.server/` folder, including requests that encode the path or change its case. Earlier versions answered requests such as `/.server/app.mjs` with the compiled server bundle.
