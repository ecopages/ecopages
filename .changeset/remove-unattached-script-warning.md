---
'@ecopages/core': patch
'@ecopages/postcss-processor': patch
---

`ecopages build` no longer warns that a `.script` file "ships nowhere". A typo in a declared path already fails the build, and the warning misreported every script declared in an MDX page's `config`. `@ecopages/postcss-processor` now requires `postcss` `^8.5.29`, which `cssnano` 9.9 expects.
