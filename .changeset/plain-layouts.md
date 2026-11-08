---
'@ecopages/core': minor
'@ecopages/react': minor
'@ecopages/react-router': minor
'@ecopages/lit': minor
---

Accept plain layout functions. `eco.page({ layout })` takes an `eco.layout()` result or a plain function typed with `LayoutProps`; its CSS and component imports are discovered, so `eco.layout()` is only needed for browser `scripts`, `modules`, stylesheet attributes or an `integration` override. `@ecopages/react-router` persists layouts by function reference: a layout module has one URL in development and production, so pages that import a layout share one function and React keeps its state. React HMR refreshes a layout through the pages that import it instead of matching component identity.

Breaking:

- `layout` accepts only layout-shaped components. A component whose props lack `children`, such as an `eco.component()` that takes other props, is a type error; use `eco.layout()` or a function typed with `LayoutProps`. `EcoPageLayoutEntry` is now the normalized entry stored on page config, and `EcoPageLayoutEntrySpec` is the `{ component, props }` entry written in `eco.page()`. `eco.layout<E, P>()` takes the layout's props as an optional second type argument; extra props must be optional to be passed as `layout`.
- A layout that renders without its `children` fails `ecopages build` with `Layout <name> (<file>) did not render its children`, in every Integration. A development request logs it as a warning; a production request returns the layout's HTML unchanged.
- `@ecopages/react-router` no longer exports `clearLayoutCache`. With `persistLayouts: false`, layouts now remount on every page change.
- Every Lit component, not only layouts: children passed to a component whose template has no children slot marker are now dropped instead of appended after its markup. Only a document shell (a template with `</html>`) without a marker still gets them before `</body>`.
