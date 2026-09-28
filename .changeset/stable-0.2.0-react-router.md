---
'@ecopages/react-router': minor
---

`ecoRouter()` hydrates from the router bundle import path (the `importMapKey` adapter field is gone). Nested layout stacks persist per tier: routes that share an outer `eco.layout()` keep that instance mounted on SPA navigation while inner tiers swap. `persistLayouts` defaults to `true`.
