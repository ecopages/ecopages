---
'@ecopages/core': patch
---

A built server keeps running after it is moved to another directory, for example when it is built in CI and copied into a container image with a different root. Server output no longer imports packages through absolute `file://` URLs of the build machine; it uses paths relative to `dist/.server/` instead. Deploy `dist`, `src`, `package.json` and the `node_modules` the build used together, keeping their relative positions, and start the server with `node dist/.server/app.mjs`. `ecopages build` warns with one line per server output file that imports packages from outside the app folder, such as a workspace root, because they do not move with the app; each line names the file and the first five packages and counts the rest. A running server does not repeat the warning.
