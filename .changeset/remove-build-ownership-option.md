---
'@ecopages/core': minor
---

Remove `buildOwnership` from the app config. The Vite plugin still sets build ownership on the config it loads for itself; an app always builds with Rolldown, also inside Vite.

**Breaking:** an `eco.config.ts` that sets `buildOwnership` no longer typechecks, and the field is ignored. Delete it from `eco.config.ts`.
