---
'@ecopages/core': patch
---

Serve a moved production build without its source tree the same as the build rendered it. `ecopages build` now records each Page's shell Dependencies (Html template, Layouts and Page) in `dist/server/processed-assets.json`, and `ecopages start` reads them instead of collecting them again, so a Page stylesheet bundle no longer falls apart or fails when `src/` is gone. The build also records the `ecopages:` virtual modules a component imports, so their module scripts no longer go missing without the sources. The asset ledger moves to version 5: run `ecopages build` again before `ecopages start`.
