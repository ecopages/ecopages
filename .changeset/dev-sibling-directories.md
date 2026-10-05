---
'@ecopages/core': patch
---

`ecopages dev` no longer treats a sibling folder whose name starts with the public, pages, includes or `src` folder's name as that folder. An edit to `src/public-api/client.ts` was handled as a public asset: it was copied outside `dist` and never reached the Page, because server modules were not invalidated. Files in folders such as `src/pages-old/` are now ordinary source files too.
