---
'@ecopages/core': patch
---

Server builds take one set of defaults from the server environment. Route modules, collection modules and the unified pages graph used to override the server `node` target with `es2022`; they now keep the `node` target like the server entry. Server modules are therefore no longer lowered to ES2022: syntax newer than that reaches the runtime as written, so the runtime must support it. Ecopages requires Node 24 or newer, which does.
