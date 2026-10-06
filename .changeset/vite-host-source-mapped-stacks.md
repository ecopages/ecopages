---
'@ecopages/vite-plugin': patch
---

In the Vite host, an error thrown while a Page or another app module renders is now reported at its line in the source file. Before, the stack trace pointed at the transformed module Vite runs, so it named the wrong line.
