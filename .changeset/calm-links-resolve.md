---
'@ecopages/browser-router': patch
'@ecopages/react-router': patch
'@ecopages/core': patch
---

Fix relative links navigating to the wrong URL. A link such as `?page=2` on `/blog` or `next` on `/docs/intro` now resolves against the current page and any `<base href>`, as a full page load would, instead of against the site root.
