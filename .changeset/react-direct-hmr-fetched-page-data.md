---
'@ecopages/react': patch
---

Fix a direct HMR update of a React Page rendering with the old props. The module URL and props now come from the document the update fetched, so a changed `staticProps` result reaches the React tree and its foreign Components. A foreign Component boundary with no server HTML now warns once per key outside production, naming the Component file.
