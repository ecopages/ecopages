---
'ecopages': patch
---

The CLI now exits with a non-zero status when the process it runs is terminated by a signal, so a build killed for running out of memory no longer reports success. `ecopages types --help` lists only the options the command uses.
