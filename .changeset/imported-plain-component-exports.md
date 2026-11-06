---
'@ecopages/core': patch
'ecopages': patch
---

A file of plain components that the server entry imports, directly or through a re-export, keeps its exports. Only a file with a default export becomes a view reference.

Under Bun, a view imported through a tsconfig alias becomes a view reference to the right file, as it does under Node and in the build.
