---
'@ecopages/core': minor
'@ecopages/react': minor
---

A layout entry's `props` factory now reads typed `locals`. Written inline in `eco.page({ layout })` on a dynamic Page, `locals` is typed from the Page's `middleware` list, like the Page's `props` hook. A layout entry shared by many Pages annotates the locals it reads on the factory parameter, such as `({ locals }: { locals: { session: Session } })`, and a Page whose middleware does not provide them is a compile error. On a static or revalidating Page the factory receives `LayoutBuildContext`, without `locals`, so an entry that reads them does not compile there; at runtime its `locals` is an empty object instead of `undefined`. `LayoutRequestContext` and `LayoutBuildContext` are new exported types, and `EcoPageLayoutEntrySpec`, `EcoPageLayoutSpec` and `EcoPageLayouts` take the factory context as an optional second type parameter.

The React browser build removes the `props` factory of a layout entry written inline in `eco.page({ layout })`, with the `.server` imports only it uses, since the browser renders every tier from the server's `tiers`. A layout entry imported from another module keeps its factory in the browser bundle, so a `.server` import that factory uses now fails the browser build instead of turning the tier into `undefined`.
