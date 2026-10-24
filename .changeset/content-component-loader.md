---
'@ecopages/content-processor': minor
'@ecopages/core': minor
---

Load a collection's MDX component through one specifier on both sides. `ecopages:content/<collection>/component` exports `loadComponent(slug)`: the server graph returns the entry wrapped for cross-Integration rendering, and the Page Browser Graph returns the browser-compiled entry. An unknown slug rejects with `HttpError.NotFound` on both. `/server` keeps `getComponent()` and `getEntryDependencies()` and is still rejected in the Page Browser Graph.

Breaking: `ecopages:content/<collection>/browser` is removed, along with its generated type declarations, the `CONTENT_BROWSER_VIRTUAL_MODULE_PATTERN` export of `@ecopages/core/build` (replaced by `CONTENT_COMPONENT_VIRTUAL_MODULE_PATTERN`), and the `'browser'` variant of `parseCollectionSpecifier()`, which is now `'component'`. The `ContentCollectionBrowserModule` type of `@ecopages/content-processor/types` is renamed `ContentCollectionLoaderModule`.

To migrate: change `import { loadComponent } from 'ecopages:content/<collection>/browser'` to `'ecopages:content/<collection>/component'`. Run `ecopages types`, `ecopages dev` or `ecopages build` once to regenerate the declarations.
