---
'@ecopages/core': patch
---

Build plugins: a filter registered with a `namespace` is now tested against the path after `<namespace>:`, as written. Before, a filter that did not start with `^` lost its first character, so `/\.md$/` in namespace `docs` did not match `docs:intro.md`, and a build with eleven or more virtual modules loaded the eleventh with the second one's contents.
