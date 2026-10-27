---
'@ecopages/core': patch
'@ecopages/lit': patch
'@ecopages/ecopages-jsx': patch
---

Install the server DOM once at startup, Radiant first and Lit second, so Lit elements still render after a Radiant element in the same process.
