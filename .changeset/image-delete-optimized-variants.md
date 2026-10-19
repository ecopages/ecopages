---
'@ecopages/image-processor': patch
---

Deleting or editing an image during development now removes its stale optimized files instead of leaving them on disk and still served. A file shared by several images is kept until the last one using it is gone.
