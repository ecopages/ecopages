---
'@ecopages/core': minor
---

Static export now writes every non-root route to `<route>.html`. A Page at `/blog` is always `blog.html`, where before it moved to `blog/index.html` whenever a sibling Page such as `/blog/about` existed. Hosts that read `blog/index.html` by path need to read `blog.html`; the bundled static server and `ecopages start` resolve both.
