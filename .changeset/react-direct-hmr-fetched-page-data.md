---
'@ecopages/react': patch
---

Fix a direct HMR update of a React Page rendering with the old props. The module URL and props now come from the document the update fetched, so a changed `staticProps` result reaches the React tree and its foreign Components. A foreign Component boundary with no server HTML now warns once per key outside production, naming the Component file.

Fix a hydrating React Page without a router hydrating with empty props: its document now carries `__ECO_PAGE_DATA__`, which a router's Html shell used to be the only source of.
