---
'@ecopages/core': patch
---

A server started without the CLI, with `node dist/.server/app.mjs` or `bun dist/.server/app.mjs`, now loads the config compiled into `dist/.server/` even when `eco.config.ts` is in the folder. Before, it loaded `eco.config.ts`, and Node failed at startup because it does not strip TypeScript under `node_modules`. A deploy can now copy the whole project, `eco.config.ts` included.
