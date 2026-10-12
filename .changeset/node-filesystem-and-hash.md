---
'@ecopages/file-system': minor
'@ecopages/core': minor
---

File system calls and content hashes use the Node implementation on every runtime. A path now has one component id on Node and on Bun.

**Breaking:**

- `BunFileSystem`, `bunFs`, and the `@ecopages/file-system/bun` export are removed. `fileSystem` is `NodeFileSystem`.
- `rapidhash` no longer calls `Bun.hash`. It uses the SHA-256 prefix on every runtime, so ids generated on Bun change.
