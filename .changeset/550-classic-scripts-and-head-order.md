---
'@ecopages/core': patch
---

HTML Pages: a Page head tag whose key the shell repeats, such as a light and a dark `theme-color`, now replaces the shell tags in source order instead of leaving a stale shell copy behind. Two classic scripts that would be written to the same output, such as `legacy.ts` beside `legacy.js`, are rejected with an error naming both files, and a classic script is compiled once per source revision rather than once for validation and once for emit.
