---
'@ecopages/core': minor
'ecopages': minor
---

Add `ecopages types`. It loads `eco.config.ts` (or `--config`), which makes processors write the types for virtual modules such as `ecopages:images` and `ecopages:content/*`, then exits; the app entry does not run. Run it before `tsc` on a fresh checkout or in CI, where those types do not exist yet: `"typecheck": "ecopages types && tsc --noEmit"`. The official templates now ship that script.
