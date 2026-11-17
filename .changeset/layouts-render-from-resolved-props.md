---
'@ecopages/core': minor
'@ecopages/react': minor
'@ecopages/react-router': minor
---

A Layout no longer receives request `locals` as a prop. It renders with what its entry's `props` factory returns, so request data reaches a Layout only through `eco.page({ layout: { component, props: ({ locals, params, query }) => ({ ... }) } })`. The server runs each factory, renders every Layout tier from the result, and writes the same objects into the `__ECO_PAGE_DATA__` envelope as `tiers`. The browser composes the Layouts from `tiers` and runs no Layout factory, so a Layout cannot render differently in the browser than it did on the server, and a Layout receives nothing but what its factory returns. A document without `tiers` still falls back to running the factories. `EcoRouter` takes an optional `tierProps`, carries it through navigation, and keeps a Layout that two consecutive Pages share mounted, with its state, while it receives the new props. `composeLayoutPageTree` takes `tierProps`. `resolveLayoutShellProps` and `resolveLayoutContextFromShell` are removed.

To migrate a Layout that read `locals`, move the read into the factory of the Layout entry on the Pages that have request data, and return only what the browser may see, for example the user and not the session token. A Layout on a static page has no `locals`, so its props must be optional.
