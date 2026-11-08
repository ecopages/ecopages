---
'@ecopages/react': patch
---

Fixed a hot update of a React Page without a router: a Foreign Child such as a Lit Component whose props changed no longer renders empty, and a hydrated Lit element keeps its server render instead of rendering again on the client.
