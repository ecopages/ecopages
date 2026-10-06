---
'@ecopages/core': patch
---

A server built with the image processor now starts with `ecopages start --runtime node` instead of failing with `Could not load the "sharp" module`. Server output no longer bundles compiled packages from `node_modules` that the app does not declare, such as the dependencies of processors and integrations; it imports them through paths relative to `dist/.server/`, so packages with native bindings or files loaded relative to themselves keep working. Server code bundled into `dist/.server/app.mjs` and into the page modules built for rendering now keeps `import.meta.url`, `import.meta.dirname` and `import.meta.filename` pointing at its source files, as `eco.config.mjs` already did, for `.ts`, `.tsx`, `.js` and `.jsx` modules. A page that reads files relative to `import.meta.dirname`, such as a glob of `src/pages`, finds them again in production builds, and Core reads its own version and dependency list instead of a `package.json` next to the bundle.
