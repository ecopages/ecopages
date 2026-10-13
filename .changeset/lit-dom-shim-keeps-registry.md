---
'@ecopages/lit': patch
---

Custom elements registered by a page's route-resolved dependency scripts with `ssr: true` now render with their shadow DOM in Lit-only renders. Preparing the page for rendering replaced the global custom element registry, so those elements were forgotten before the page rendered and came out as plain tags.
