---
'@ecopages/core': patch
'@ecopages/react': patch
'@ecopages/dev-toolbar': patch
---

React island props that contain text outside Latin-1, such as `€`, CJK characters or emoji, no longer crash server rendering. The islands hydrate with the same text, and the dev toolbar's Islands panel previews it instead of garbled characters.
