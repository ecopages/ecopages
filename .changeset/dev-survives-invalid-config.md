---
'ecopages': patch
---

`ecopages dev` no longer stops when a restarted dev server exits with an error. After an edit to `eco.config.ts` (or `--config`) or a dotenv file restarts the dev server, if the restarted server exits with an error, for example because of an invalid config, `ecopages dev` waits for the next change in the project or a linked workspace package and starts again, so an error in a file the config imports is recovered from too. A change saved while the restarted server was still loading is not missed. An error on the first start, and Ctrl+C, still end the command.
