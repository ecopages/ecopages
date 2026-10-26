---
'@ecopages/core': minor
'ecopages': minor
'@ecopages/file-system': minor
'@ecopages/lit': patch
---

Production `ecopages start` runs from `dist/` and `node_modules/` only. The build writes the filesystem route list into `dist/.server/routes.json`; start loads that list and does not scan sources. The deploy manifest no longer records the source config path or hash. Start checks that `dist/` is complete (one build id, every listed output exists) and does not compare source fingerprints. Production server output leaves `import.meta` pointing at the emitted files.

This is a breaking change: a deploy that relied on `src/` at startup, on source config identity checks, or on production `import.meta` pointing at source files will fail. Declare files a production module reads next to itself in `serverFiles`, or move them to `public/`.
