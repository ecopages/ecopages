---
'@ecopages/react': patch
---

React HMR in `ecopages dev` no longer treats a sibling folder whose name starts with the pages or layouts folder's name as that folder. An edit to `src/pages-old/card.tsx` was handled as a Page edit and an edit to `src/layouts-v2/shell.tsx` as a layout edit, which reloaded every page's layout instead of updating the changed component. Files in such folders are now ordinary components.
