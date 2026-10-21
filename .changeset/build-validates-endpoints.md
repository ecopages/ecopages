---
'@ecopages/core': minor
---

`ecopages build` imports every endpoint file (`*.api.ts`) and checks its exports before it bundles the server and generates pages. A file with no method export, or a method export that is not a handler, is built for another method or sets `path`, now fails the build with an error naming the file and its URL, instead of building cleanly and answering `500` on its first request after `ecopages start`. `--keep-going` does not skip this check. In `ecopages dev` the same error shows on the file's first request.
