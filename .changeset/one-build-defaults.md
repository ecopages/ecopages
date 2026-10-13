---
'@ecopages/core': patch
---

Server builds take one set of defaults from the server environment. Route modules, collection modules and the unified pages graph used to override the server `node` target with `es2022`, which lowered newer syntax in user code for no reason on Node. They now keep the `node` target like the server entry.
