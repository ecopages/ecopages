---
'@ecopages/vite-plugin': patch
---

In the Vite host, editing `vite.config.ts` or a file it imports, or an env file for the current mode (`.env`, `.env.local`, `.env.<mode>`, `.env.<mode>.local`), now restarts Vite, as in a plain Vite app. Before, these edits were ignored, because Vite restarts for them only inside its HMR update, which the Ecopages host turns off. An `eco.config.ts` edit still needs a full restart of the dev server, as the terminal message says, unless `app.ts` imports it.
