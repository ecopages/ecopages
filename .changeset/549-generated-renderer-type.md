---
'@ecopages/core': patch
---

Keep the generated Integration renderer's `name` property concrete in its constructor type so consumers can subclass the factory result without re-declaring it.
