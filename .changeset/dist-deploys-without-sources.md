---
'@ecopages/core': minor
'ecopages': minor
'@ecopages/file-system': minor
'@ecopages/lit': patch
---

Production `ecopages start` loads its routes and server modules from `dist/` and `node_modules/`. The build writes the filesystem route list into `dist/server/routes.json`; start loads that list and does not scan source Pages or compare source fingerprints. Start does not copy the source public directory into `dist/`; the build already did. The deploy manifest no longer records the source config path or hash. Start, through `ecopages start` or `node dist/server/app.mjs`, checks that `dist/` is complete (one build id, every listed output exists, the route list present). Production server output leaves `import.meta` pointing at the emitted files.

This is a breaking change: a deploy that relied on source Pages at startup, source config identity checks, or production `import.meta` pointing at source files will fail. Declare files a production module reads next to itself in `serverFiles`, or move them to `public/`.
