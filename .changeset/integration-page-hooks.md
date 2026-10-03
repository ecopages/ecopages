---
'@ecopages/core': minor
---

Integrations can compile their own Page files and opt out of Params. `IntegrationPlugin.compilePageModule(filePath, appConfig)` returns a Page module, or a promise of one, without the bundler, and an Integration that overrides `acceptsParams` with `false` makes route discovery reject the `[param]` and `[...param]` filenames it owns. A user Integration that registers a longer extension than `.html`, such as `.page.html`, keeps its own files.

Core now matches a file to its Integration and its route path by the longest registered extension the file name ends with:

- A static export includes Pages whose file name contains a dot, such as `release.notes.tsx` (route `/release.notes`). Before, rendering them failed with "No integration plugin found". The dev server does not serve these routes yet.
- `about.kita.tsx` gets the route `/about` in any Integration order, and `notes.mdx` no longer becomes `/notesx` when `.md` is registered before `.mdx`.
- A `.kita.tsx` or `.lit.tsx` Page whose Integration is not registered now renders with the Integration that owns `.tsx`, at a dotted route such as `/about.kita`, instead of failing with "No integration plugin found". Like other dotted routes, the dev server does not serve it yet.
- A project inside a directory with brackets in its name, such as `/work/[client]/site`, no longer has every route treated as dynamic.
