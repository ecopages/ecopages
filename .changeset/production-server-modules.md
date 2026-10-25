---
'@ecopages/core': minor
---

`ecopages build` emits every server entry into `dist/.server/` and writes `server-modules.json`. `ecopages start` imports that map and never compiles.

This is a breaking change: production no longer compiles Pages, Layouts, Html shells, Endpoints, `app.static` views, error pages, or `ssr: true` scripts from source. A missing entry names the file and says to run `ecopages build`. Development is unchanged.
