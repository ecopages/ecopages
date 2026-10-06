---
'@ecopages/core': patch
---

Fix Island Hosts rendered as a Foreign Subtree missing `data-eco-island`. Root attributes with an empty value were dropped, so the Dev Toolbar did not list these islands and React did not unmount islands nested in an element that was removed. Empty-valued root attributes are now kept as `name=""`.
