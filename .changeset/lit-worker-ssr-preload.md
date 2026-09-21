---
'@ecopages/lit': patch
---

Fix Lit page SSR in the static-render worker: preload `ssr: true` scripts through the app module loader so custom elements emit declarative shadow roots again.
