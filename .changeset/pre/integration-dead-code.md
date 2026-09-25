---
'@ecopages/ecopages-jsx': patch
'@ecopages/react': patch
---

Remove unused JSX asset-frame collection, unused React HMR script helpers, and redundant `explicitGraph: true` from the React playground and template configs, where a router already hydrates every page.
