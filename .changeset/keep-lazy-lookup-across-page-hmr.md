---
'@ecopages/react': minor
'@ecopages/content-processor': minor
---

Keep one lazy collection lookup per collection across Page HMR, so a loaded entry renders again without the Suspense fallback. An edited MDX file re-renders that entry without a document reload. The `/component` loader now carries its collection name as `loadComponent.collection`.
