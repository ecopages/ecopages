---
'@ecopages/core': minor
'ecopages': minor
---

Add `ecopages types`. It runs the entry file until `createApp()` finalizes `eco.config.ts`, which makes processors write the types for virtual modules such as `ecopages:images` and `ecopages:content/*`, then exits. Code after `createApp()` does not run; code before it does. Run it before `tsc` on a fresh checkout or in CI, where those types do not exist yet: `"typecheck": "ecopages types && tsc --noEmit"`. The official templates now ship that script.

`createApp()` exits right after finalizing the config when the entry runs with `--types`.
