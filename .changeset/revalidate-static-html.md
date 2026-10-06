---
'@ecopages/core': patch
---

Send `must-revalidate` and an ETag on HTML under the `static` Cache Strategy so browsers revalidate after a redeploy. Keep `immutable` for content-hashed asset URLs only.
