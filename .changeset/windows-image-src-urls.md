---
'@ecopages/image-processor': patch
---

Build optimized image `src` and `srcset` URLs with `/` on Windows. They used the platform separator, so images pointed at `\assets\optimized\...` and did not load.
