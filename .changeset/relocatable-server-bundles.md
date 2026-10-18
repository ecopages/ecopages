---
'@ecopages/core': minor
---

A built server keeps running after it is moved to another directory, for example when it is built in CI and copied into a container image with a different root. Server output imports packages through paths relative to `dist/.server/` instead of absolute `file://` URLs from the build machine. `ecopages build` warns once per server output file that imports packages from outside the app folder, such as a workspace root, because those packages do not move with the app; each warning names the file and up to five packages.

**Breaking:** A deployment must include `dist`, `src`, `package.json`, and the build's `node_modules` at their original relative paths. Start the deployed server with `node dist/.server/app.mjs`.
