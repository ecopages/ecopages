---
'@ecopages/core': minor
'@ecopages/lit': patch
'@ecopages/ecopages-jsx': patch
'@ecopages/kitajs': patch
'@ecopages/mdx': patch
---

Mark a component as an island only when it ships its own client script, excluding the scripts of Foreign Children (components of another integration nested inside it, whether declared in `dependencies.components` or rendered inside it). A Lit, Ecopages JSX, KitaJS, MDX or HTML component without scripts that wraps an island of another integration no longer gets `data-eco-component-id` or `data-eco-island-integration` on its root. The Page still receives every script.

**Breaking:** `finalizeIslandComponentRender()` takes a required third argument. Custom integrations must pass the component's own assets, excluding those of Foreign Children, separately from the merged `assets` of the render result.
