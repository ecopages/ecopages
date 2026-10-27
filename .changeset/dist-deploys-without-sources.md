---
'@ecopages/core': minor
'ecopages': minor
'@ecopages/file-system': minor
'@ecopages/lit': patch
---

Production `ecopages start` loads its routes and server modules from `dist/` and `node_modules/`. The build writes the filesystem route list into `dist/.server/routes.json`; start loads that list and does not scan source Pages or compare source fingerprints. If the configured public directory is present, start still copies its static files into `dist/`. The deploy manifest no longer records the source config path or hash. Start checks that `dist/` is complete (one build id, every listed output exists). Production server output leaves `import.meta` pointing at the emitted files.

This is a breaking change: a deploy that relied on source Pages at startup, source config identity checks, or production `import.meta` pointing at source files will fail. Declare files a production module reads next to itself in `serverFiles`, or move them to `public/`.
