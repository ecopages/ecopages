---
'@ecopages/react': patch
---

Fix `ecopages start` exiting at boot for a React app with an island. The island and Page hydration lifecycles now ship as `@ecopages/react/island-hydration` and `@ecopages/react/page-hydration`, so the bundled production server no longer compiles them from the package source.
