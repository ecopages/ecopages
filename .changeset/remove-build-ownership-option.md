---
'@ecopages/core': minor
---

Remove `buildOwnership` from the app config. An app always builds with Rolldown.

**Breaking:** an `eco.config.ts` that sets `buildOwnership` no longer typechecks, and the field is ignored. Delete it from `eco.config.ts`.
