---
'@ecopages/postcss-processor': minor
---

The PostCSS processor declares `*.css` as its stylesheet extension and no longer names `.scss`, `.sass` or `.less` in its capability, watch extensions or prewarm glob. It never compiled those languages, so an app that relied on it to claim them registers its own stylesheet Processor instead.
