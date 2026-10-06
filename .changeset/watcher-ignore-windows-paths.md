---
'@ecopages/core': patch
---

On Windows, `ecopages dev` now ignores `node_modules`, `.git`, the work directory and `distDir` again. They were watched, so a glob in `additionalWatchPaths` based at the project root, such as `**/*.config.ts`, crawled all of `node_modules`, and build output reached the change pipeline. `additionalWatchPaths` globs written with `\` separators, such as `content\**\*.md`, now watch the folder before the first wildcard.
