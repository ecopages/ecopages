---
'@ecopages/core': minor
---

Move public build output into `dist/client/` and keep production server files in `dist/server/`. Nothing a static host publishes holds server code any more.

This is a breaking change for existing deploys. After upgrading:

- Rebuild. An output with only the old `dist/.server/` is not found by `ecopages start`.
- Point a static host's output directory at `dist/client` instead of `dist`.
- Start the server with `node dist/server/app.mjs` (or `bun dist/server/app.mjs`) instead of `dist/.server/app.mjs` in Dockerfiles and process managers.
- Write processed images into `dist/client/images` instead of `dist/images`; an image processor `outputDir` left at `dist/images` writes outside the served folder and its images return 404. Processors receive `distDir` pointing at `dist/client/`.
