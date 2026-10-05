---
'@ecopages/core': patch
---

`ecopages build` without `--force` now rebuilds Pages when a module they import changes, including a module shared by several Pages, such as a Layout, or one loaded through `import()`. The server bundle is also rebuilt when a module its entry loads through `import()` changes. Before, the build reused its cached output and rendered the old code.
