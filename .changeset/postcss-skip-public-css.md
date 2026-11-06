---
'@ecopages/postcss-processor': patch
---

The PostCSS Processor no longer emits hashed copies of stylesheets in the public directory. Public files are served as written, and the extra copy was linked by no Page.
