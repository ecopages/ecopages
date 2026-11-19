---
'@ecopages/ecopages-jsx': patch
---

Radiant hosts on server-rendered pages now hydrate in place instead of re-rendering on first connect: the Radiant hydrator head script is bundled and loaded as a module before custom-element scripts.
