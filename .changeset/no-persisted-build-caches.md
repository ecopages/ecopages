---
'@ecopages/core': patch
'ecopages': patch
---

`ecopages build` compiles the server entry, route modules, and unified pages graph from source in every new process. Warm reruns no longer reuse `.eco` `.build-cache.json` files from an earlier build. `--force` still empties `dist/` and leftover cache files from older releases.
