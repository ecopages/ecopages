---
'@ecopages/core': patch
---

Static export of explicit routes now writes the right file for every `staticPaths` entry. A catch-all such as `/docs/:...path` expands to its segments instead of writing every entry to one file, and a param whose name starts another param's name (`:id` and `:idx`) no longer corrupts the path.
