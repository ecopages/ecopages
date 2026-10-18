---
'@ecopages/core': minor
---

Build plugins can register source transforms through `EcoBuildPluginBuilder.transform`. The transform hook runs after a `load` plugin has supplied a module, so transformations still apply when a load plugin claims that file.
