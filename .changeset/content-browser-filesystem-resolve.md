---
'@ecopages/core': patch
'@ecopages/content-processor': patch
'@ecopages/react': patch
'ecopages': patch
---

Preview and production builds now resolve content collection `/browser` modules from disk so relative MDX imports work, emit empty transform maps so Rolldown does not warn, hydrate React islands on non-React routes from the page client plan, stamp lazy-trigger attributes onto serialized foreign-child HTML, keep resolved lazy triggers across a second dependency pass, give concurrent grouped content-script builds unique temp files, and re-export named island module exports so hydration scripts can resolve the component.
