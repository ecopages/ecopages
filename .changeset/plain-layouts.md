---
'@ecopages/core': minor
'@ecopages/react': minor
'@ecopages/react-router': minor
'@ecopages/lit': minor
---

Accept plain layout functions. `eco.page({ layout })` takes an `eco.layout()` result or a plain function typed with `LayoutProps`; its CSS and component imports are discovered, so `eco.layout()` is only needed for browser `scripts`, `modules`, stylesheet attributes or an `integration` override. `@ecopages/react-router` persists layouts by function reference: a layout module has one URL in development and production, so pages that import a layout share one function and React keeps its state. React HMR refreshes a layout through the pages that import it instead of matching component identity.

Breaking:

- `layout` accepts only layout-shaped components. A component whose props lack `children`, such as an `eco.component()` that takes other props, is a type error; use `eco.layout()` or a function typed with `LayoutProps`. `EcoPageLayoutEntry` is now the normalized entry stored on page config, and `EcoPageLayoutEntrySpec` is the `{ component, props }` entry written in `eco.page()`.
- A layout that renders without its `children` fails `ecopages dev` and `ecopages build` with `Layout <name> (<file>) did not render its children`, in every Integration.
- `@ecopages/react-router` no longer exports `clearLayoutCache`. With `persistLayouts: false`, layouts now remount on every page change.
- A Lit component that does not render its children no longer gets them appended; only a document shell without a children slot still gets them before `</body>`.
