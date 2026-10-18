---
'@ecopages/core': patch
---

Development can hydrate islands whose source lives in a workspace-linked package. Those modules are served from `/assets/__eco_dev__/@fs/...` instead of being rejected for sitting outside the app `src` folder.
