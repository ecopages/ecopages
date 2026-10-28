---
'@ecopages/core': patch
---

Watch-mode requests and Page prewarm wrap in the build-queue request scope and record filesystem inputs on the app's build-input index. Non-watch production and preview requests do not.
