---
'@ecopages/ecopages-jsx': patch
---

Render the JSX children of a Radiant host inside the host's context providers during SSR. A context consumer passed as a child of a provider host now resolves that provider in the server HTML instead of rendering its fallback state until it connects in the browser. Requires Radiant 0.4.
