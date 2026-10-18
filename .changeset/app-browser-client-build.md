---
'@ecopages/core': minor
'@ecopages/react': minor
'@ecopages/ecopages-jsx': minor
---

Island and lazy-entry browser modules for a Page are emitted together. Hydration scripts use the emitted URLs, so islands that import the same app module share one browser module instance.
