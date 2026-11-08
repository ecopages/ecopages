---
'@ecopages/core': patch
---

Keep `ecopages dev` usable while a script is broken, as it already is for a stylesheet. A Page request renders instead of answering 500 when a content, file, node-module or grouped script fails to bundle, and serves that script's last good bundle, or renders without it when it never built since the dev server started. The dev transform server keeps answering with the last compiled module of any browser module that fails to compile, so the page keeps its behaviour. An `ssr: true` script that fails to evaluate on the server leaves its element without server rendering. Each failure shows in the browser overlay with the script's path, also on a page that loads later, and the next good save clears it. `ecopages build` and static generation still fail on a broken script, and `ecopages start` is unchanged. A Page module that fails to build on the server still answers 500.
