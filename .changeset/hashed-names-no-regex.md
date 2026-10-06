---
'@ecopages/core': patch
---

Resolve Core runtime imports during the server build and leave authored strings that look like imports unchanged. Hashed browser outputs are no longer rewritten after they are named.
