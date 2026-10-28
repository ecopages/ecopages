---
'@ecopages/core': patch
---

Production server loaders preserve bundle context when imported by a wrapper, so startup loads the emitted config and rejects incomplete dist output.
