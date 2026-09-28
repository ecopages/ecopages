---
'ecopages': minor
---

The CLI launches on Bun when you invoke it with Bun, and on Node otherwise. Runtime selection follows `--runtime`, the package manager, and Bun availability. Use `--entry-file` rather than a positional entry path. `ecopages build` and `preview` run the source entry; `start` runs built output. `--config`, `--base-url`, and `--hostname` flow through the launch plan. Official templates are fetched from git tag `v${version}`.
