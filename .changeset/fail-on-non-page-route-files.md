---
'@ecopages/core': minor
---

Fail the build when a route file does not default-export a Page. Core rendered whatever a file under `src/pages` default-exported, so a helper or script left there became a route that rendered garbage or failed with an unrelated error. After a route module loads, its Integration now says whether the default export is a Page it accepts: an `eco.page()` result the build attributed to that route file, an HTML Page or an MDX module. Anything else fails `ecopages dev` and `ecopages build` with an error that names the file and the fixes: prefix the name with `_`, give it a `.server` or `.script` role suffix, or move it out of `src/pages`. In development the next request after a fix loads the corrected module, with no restart.

A route file declares its Page with a literal `eco.page(...)` call in that file, and one that does not fails with a message naming the rule. The build reads `eco.page`, `eco.layout`, `eco.component` and `eco.html` from the source as a call on the identifier `eco`, and stamps each call's identity with the file that holds it. A Page made by a wrapper in another file (`_create-page.tsx`), re-exported from another file, or made through an alias (`const page = eco.page`) or a renamed import therefore has no identity or another file's, and server options such as `staticProps` and `metadata` stayed in the React browser bundle with no warning. The pages docs and the eco namespace reference state both rules.

Breaking: a route file that does not default-export a Page, or whose Page was not declared by a literal `eco.page(...)` call in that file, now fails the build instead of rendering.

Migration:

1. Find route files that fail: run `ecopages build` (or request each route in `ecopages dev`). Each error names the file, and either says it does not default-export a Page or names the literal-call rule.
2. For "does not default-export a Page": if the file is a helper, component, script or test, keep it out of routing: rename it with a `_` prefix (`_card.tsx`), or with a `.server` or `.script` suffix (`db.server.ts`, `counter.script.ts`), or move it out of `src/pages`, and fix its imports. If it should be a page, make its default export an `eco.page({ ... })` result (an MDX file needs a default-exported function; an HTML Page is a `.html` file).
3. For the literal-call error: write the `eco.page({ ... })` call in the route file itself and export its result as the default. A wrapper such as `export const createPage = (options) => eco.page({ ...options })` in another file, `const page = eco.page`, a renamed import, and `export { default } from './other-page'` all fail. Move what the wrapper shared into a plain options object or a helper that returns options (a `layout`, a `metadata` function), and import that into each route file's own `eco.page({ ...shared, render })`. `eco.layout`, `eco.component` and `eco.html` must be called literally too, in the file that declares them.
4. To find every wrapper or alias up front, search `src` for `= eco.page`, `= eco.layout`, `= eco.component`, `= eco.html`, for `import { eco as`, and for route files with `export { default }` or `export default` of an imported value.
5. Verify: `ecopages build` completes, and the generated routes (`dist/server/routes.json`) match the pages you expect.
