---
'@ecopages/core': patch
---

Render and import failures now keep their original stack in development logs. A page that throws while rendering, or fails to import, previously logged only `Error importing page file: Error: x` or `Error rendering page: x` without a stack or code frame; the log and the development error page now include the original error and its stack. Production error responses still contain no stack.
