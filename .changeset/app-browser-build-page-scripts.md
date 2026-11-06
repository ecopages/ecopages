---
'@ecopages/core': patch
'@ecopages/lit': patch
---

Build every Page's component scripts in the production app-wide browser build. Route preparation used to bundle each script on its own, so a package two scripts import, such as Lit, was loaded once per script; the scripts now share its chunk. `ecopages start` and the Lit static-render worker restore these outputs from `browser-client-manifest.json`.

A lazy script entry is named after the Integration of the component that declares it, so a Lit component inside a Kita Page reuses its planned output instead of building it again.
