---
'@ecopages/core': minor
---

Declare a file's role by its name, and keep server modules, browser scripts and private files out of routing. `<name>.server.<ext>` is a server-only module, `<name>.script.<ext>` is a browser script, and `<name>.api.<ext>` is still an endpoint, where `<ext>` is `.ts`, `.tsx`, `.js` or `.jsx`. The suffix is matched before template extensions, and a file or folder under `src/pages` whose name starts with `_` is private. The router used to skip only `.ecopages-node.` files (a leftover with no producer, now removed), so with React's `.tsx` a `db.server.tsx` routed to `/db.server` and `counter.script.tsx` to `/counter.script`; none of these is a route now, and they can sit next to the pages that use them. The client graph and the browser build read the `.server` boundary from the same module as the router.

A role segment anywhere else in a file name under `src/pages` fails the build with the file and the expected form: `card.server.kita.tsx` and `nav.script.lit.tsx` are errors, since a Kita or Lit template is already rendered on the server and a browser script is not a template. An Integration that registers an extension ending in a role suffix (`.server.tsx`, `.script.ts`) is rejected at config assembly, as `.api.*` already was. In development, a `.script.*` file that no source file lists in `dependencies.scripts` logs one warning; the suffix attaches nothing by itself.

Breaking: a file under `src/pages` that ends in `.server.<ts|tsx|js|jsx>` or `.script.<ts|tsx|js|jsx>`, or has a path segment starting with `_`, stops being a route. A file with a role segment in another position (`x.server.kita.tsx`) fails the build instead of routing. An Integration extension ending in a role suffix fails config assembly.

Migration:

1. Find files under `src/pages` that stop being routes: `find src/pages \( -name '*.server.*' -o -name '*.script.*' -o -name '_*' \)` (also look for `_`-prefixed folders). If one was an intentional page, rename it so it has no role suffix and no leading `_`, and update links to its URL.
2. Find files that now fail the build: search `src/pages` for names with `.server.`, `.script.` or `.api.` followed by anything other than `ts`, `tsx`, `js` or `jsx` (for example `card.server.kita.tsx`, `nav.script.lit.tsx`). Rename a server-only module to `<name>.server.ts(x)`, a browser script to `<name>.script.ts(x)`, and a page to a name without the role segment.
3. If a custom Integration registers an extension ending in `.api.*`, `.server.*` or `.script.*`, rename the extension.
4. Optional: move modules that only support pages (components, helpers, tests) next to them and prefix them with `_`, or give them a `.server`/`.script` suffix, instead of keeping them outside `src/pages`.
5. Verify: run `ecopages build` and compare the generated routes (`dist/server/routes.json`) with your expected URLs. In development, a warning `... is a browser script (.script.*) that no page or component attaches` means a `.script.*` file needs a `dependencies.scripts` entry or a new name.
