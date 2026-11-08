---
'@ecopages/core': patch
---

A missing Html template now fails with an error that names the expected `src/includes/html.<ext>` file and how to add it, instead of an import failure that told the user to run `ecopages build`.
