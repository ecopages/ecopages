---
'@ecopages/core': patch
'@ecopages/dev-toolbar': patch
'@ecopages/react': patch
'@ecopages/image-processor': patch
---

Smaller packages. The published tarballs no longer include browser test files, test helpers and test fixtures, which imported a test runner that is not installed with the package. `@ecopages/react`, `@ecopages/dev-toolbar` and `@ecopages/image-processor` also stop installing dependencies they never used.
