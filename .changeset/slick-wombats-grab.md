---
'@ecopages/core': minor
---

Replace `rapidhash` and duplicate SHA-1/SHA-256 recipes with `contentHash(input, length?)`, which returns a stable SHA-256 digest in lowercase hexadecimal.

**Breaking:** Remove `rapidhash` from `@ecopages/core/build`. Use `contentHash(input, 16)` for its former 64-bit SHA-256 prefix in hexadecimal; convert that prefix to a bigint only when a numeric representation is required.
