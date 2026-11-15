---
'@ecopages/react': patch
'@ecopages/core': patch
---

Keep the modules of foreign Eco Components out of React islands. A React island that rendered an Eco Component another Integration owns bundled that Component's module and everything it imported, compiled with React's JSX runtime, even though React only keeps the Component's server HTML. A Radiant controller the Component rendered then shipped eagerly with the island, ignored `lazy`, and rendered `[object Object]` if it contained JSX. React now names such a Component by its identity when its export is an `eco.*()` call, and drops the import, so the Component's browser scripts reach the Page only through its own `dependencies`. A foreign export that is not statically a Component, such as one a function returns, keeps its import as before, and a barrel import that keeps another binding still loads the Component's module. Core exports `readExportedComponentIdentities` from `@ecopages/core/build` for this.
