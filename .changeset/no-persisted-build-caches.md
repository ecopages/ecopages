---
'@ecopages/core': patch
'ecopages': minor
---

Edits to files imported by `eco.config.ts`, shared Page modules, and content under Processor watch paths appear in the next `ecopages build`; these inputs are no longer hidden by cached output from an earlier process.

**Breaking:** `ecopages build --force`, `ecopages preview --force`, and `ecopages start --force` fail as unknown options. Remove `--force`; production builds no longer reuse persisted cache state.
