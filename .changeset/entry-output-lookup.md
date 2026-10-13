---
'@ecopages/core': patch
---

A build now hands each caller the file emitted for its own entry. Page script bundles, route modules, collection server modules, HTML Page module scripts and the dev transform server used to pick an output by file name or take the first JavaScript file, which returned a shared chunk when a build split code.
