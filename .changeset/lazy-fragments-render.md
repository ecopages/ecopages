---
'@ecopages/core': patch
---

A lazy Component whose render returns a fragment now keeps its sibling elements and puts `data-eco-trigger` on the first one, instead of being written into the Page as `[object Object],[object Object]`.
