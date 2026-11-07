---
'@ecopages/file-system': minor
'@ecopages/core': patch
'@ecopages/react': patch
'@ecopages/ecopages-jsx': patch
'@ecopages/content-processor': patch
'@ecopages/image-processor': patch
'@ecopages/postcss-processor': patch
'@ecopages/lit': patch
'@ecopages/mdx': patch
'ecopages': patch
---

Add `@ecopages/file-system/path`, path operations that always return forward slashes and keep a Windows drive letter in upper case, with converters from native paths and `file:` URLs. `fileSystem.realpath`, `glob`, `readdir`, `readlink`, `mkdtemp` and watcher events now return paths in that form on Windows.

Ecopages now holds every path in that form, so on Windows paths no longer leak backslashes into URLs, cache keys and generated imports, and string comparisons of paths no longer miss. A server build with `preserveModules` also names a module on another drive than its root instead of failing.
