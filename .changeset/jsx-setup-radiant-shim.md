---
'@ecopages/ecopages-jsx': patch
---

Core installs the shared server DOM before production emit imports Radiant element modules, so JSX Integration imports do not need to install DOM globals as a side effect.
