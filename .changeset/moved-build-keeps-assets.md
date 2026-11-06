---
'@ecopages/core': patch
---

Record the stylesheets and scripts a production build processed in `dist/server/processed-assets.json` and serve them from `dist/` at request time. A build copied to another folder or machine, or one whose `src/` was removed, keeps linking its Page stylesheets and scripts instead of dropping them with a `Skipping missing` warning.
