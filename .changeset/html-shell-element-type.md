---
'@ecopages/core': patch
---

Type an `eco.html()` shell's `children` and `headContent` with the element type it is given. `eco.html<JsxRenderable>()` or `eco.html<ReactNode>()` now renders `{children}` and `{headContent}` without a cast; they were typed as the default element type before.

To migrate: a `Head` component that receives `headContent` as its children declares its props with the same element type, `eco.component<PageHeadProps<JsxRenderable>, JsxRenderable>()` (or `PageHeadProps<ReactNode>` with React) instead of `PageHeadProps`. Casts such as `{children as 'safe'}` can be removed.
