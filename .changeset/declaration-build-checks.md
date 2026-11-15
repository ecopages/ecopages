---
'@ecopages/core': patch
'@ecopages/mdx': patch
---

The build now checks the declarations it reads from source.

- `ecopages build` warns about each `.script` file under `src` that no literal `dependencies.scripts` entry, HTML `<script src>` or attached script's import reaches, which is usually a typo in the declaration's path. A `src` computed at runtime, or a declaration in an MDX file, is not read, so its script is reported too.
- A view passed to `app.static()`, an error-page helper or `ctx.render()` must now declare its Page with a literal `eco.page(...)` call in its own file, as a route file must. A view made by a wrapper function, an alias or a re-export previously rendered and now fails with the literal-call error. Call `eco.page(...)` directly in the view's file.
- A role segment anywhere but directly before a script extension, such as `src/components/card.server.kita.tsx`, now fails every build that compiles the file, and `ecopages dev` reports it and builds again after you rename it. Previously only files under `src/pages` were checked. Rename the file to `<name>.<api|server|script>.<ts|tsx|js|jsx>`, or drop the role segment.
- Layouts are no longer built as separate server entries and no longer appear in `server-modules.json`; they are bundled once with the module that imports them, so a layout passed through a variable or from an MDX page is covered too.
- An MDX page's `config.layout` accepts the same forms as `eco.page({ layout })`, and the page module no longer carries a `layout` value of its own.
