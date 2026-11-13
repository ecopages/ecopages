---
'@ecopages/react': minor
---

Keep bare side-effect imports (`import 'x'`) in every browser module of a React build. The client graph dropped them from any file under a `pages` or `layouts` folder (a match on any folder of the absolute path) and from every entry, so a layout script such as `import '@scope/pkg/define-element'` shipped no code from the package and its custom elements never upgraded; the same file under `components/` worked. Pages, layouts, entries, components, scripts and helpers now behave alike. Stylesheet imports are still delivered by core, not bundled, and `.server` modules and `node:` specifiers are still removed. An unprefixed built-in (`import 'fs'`) is kept and fails the build with a `[browser-build] Node builtin` error.

Breaking: a bare import that only server code needed, left in a page, layout or `dependencies.scripts` entry and previously dropped, now reaches the browser.

Migration:

1. Find bare imports in browser-bound modules: search `src` for lines that match `^import ['"]` (an import with no binding), mainly in files under `pages/` and `layouts/` and in scripts listed in `dependencies.scripts`.
2. For each one the browser does not need (server setup, database or logging registration), move it into a module named `*.server.ts` and import that from server code only. A `.server` module referenced from browser code fails the build with the file and binding.
3. After upgrading, a `[browser-build] Node builtin "<x>" cannot be bundled for the browser (imported from .../node_modules/<pkg>/...)` error means a bare import of `<pkg>` in a page, layout or script now reaches the browser. Move it to a `.server` module (step 2). A pure-JS server package such as `dotenv/config` now bundles silently, so search for those too.
4. Files you moved out of `layouts/` or `pages/` only to keep their bare imports can move back.
5. Verify: run `ecopages build`, then check that the browser output under `dist/client/assets` contains the code of each package you meant to keep, and that no server-only package (for example a database driver) appears in it.
