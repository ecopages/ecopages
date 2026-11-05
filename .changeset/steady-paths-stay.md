---
'@ecopages/core': minor
---

Static export now picks a Page's output file from its own source file instead of from whether sibling Pages exist. A Page in an `index` file (`pages/blog/index.tsx`) always writes `blog/index.html`, and any other Page (`pages/blog.tsx`) always writes `blog.html`. Previously an `index` Page with no sibling wrote `blog.html` and moved to `blog/index.html` once a sibling Page such as `pages/blog/about.tsx` was added. Explicit static routes write `<route>.html`. The bundled static server and `ecopages start` resolve both layouts; hosts that read output files by path need to expect the new locations for these cases.
