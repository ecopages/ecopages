---
'@ecopages/core': minor
ecopages: minor
---

Static builds now fail when a filesystem or explicit Page fails to render, after collecting route-specific failures and finishing the remaining export work. `ecopages build --keep-going` retains the previous log-and-continue behavior.
