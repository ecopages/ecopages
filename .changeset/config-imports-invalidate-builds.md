---
'@ecopages/core': patch
---

`ecopages build` without `--force` now rebuilds Pages after an edit to a file that `eco.config.ts` imports, such as a module that holds MDX remark or rehype plugin options. Before, the build reused Pages compiled with the old options. Only files inside the project root are tracked; packages and files outside the root, such as a shared options module elsewhere in a monorepo, are not.
