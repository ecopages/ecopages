---
'@ecopages/core': minor
'@ecopages/react': patch
---

One rule names the Integration that owns a Component: the `integration` override on its config, then the Integration of the file that created it, then its parent's. It is the new `getComponentOwner(component, inheritedOwner?)` export, and render routing, the component graph walk, the page client plan, dependency collection, the explicit view lookup, custom-element script preloading and the React renderer all use it.

**Breaking:** `composeDocumentShell` and `renderPageDocumentShell` take the `integrationName` of the Integration rendering the shell. A shell component that names no owner reports that Integration instead of `'ecopages'`.
