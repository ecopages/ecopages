---
'@ecopages/core': minor
'@ecopages/mdx': minor
---

Fail the build when a route file does not default-export a Page. Core rendered whatever a file under `src/pages` default-exported, so a helper or script left there became a route that rendered garbage or failed with an unrelated error. After a route module loads, its Integration now says whether the default export is a Page it accepts: an `eco.page()` result the build gave an identity, an HTML Page or an MDX module. Anything else fails `ecopages dev` and `ecopages build` with an error that names the file and the fixes: prefix the name with `_`, give it a `.server` or `.script` role suffix, or move it out of `src/pages`. In development the next request after a fix loads the corrected module, with no restart. An Integration with Pages that carry no identity can say what it accepts through the new optional `acceptsPageModule` renderer hook; MDX uses it.

A route whose default export is an `eco.page()` result that the build found no literal `eco.page(...)` call for fails with a message naming the rule. The build reads `eco.page`, `eco.layout`, `eco.component` and `eco.html` from the source as a call on the identifier `eco`, so a wrapper function, an alias (`const page = eco.page`) or a renamed import gives the Page no identity, and server options such as `staticProps` and `metadata` stayed in the React browser bundle with no warning. The pages docs and the eco namespace reference state both rules.

Breaking: a route file that does not default-export a Page, or that default-exports a Page through a wrapper or alias of `eco.page`, now fails the build instead of rendering.

Migration:

1. Find route files that fail: run `ecopages build` (or request each route in `ecopages dev`). Each error names the file, and either says it does not default-export a Page or names the literal-call rule.
2. For "does not default-export a Page": if the file is a helper, component, script or test, keep it out of routing: rename it with a `_` prefix (`_card.tsx`), or with a `.server` or `.script` suffix (`db.server.ts`, `counter.script.ts`), or move it out of `src/pages`, and fix its imports. If it should be a page, make its default export an `eco.page({ ... })` result (an MDX file needs a default-exported function; an HTML Page is a `.html` file).
3. For the literal-call error: replace the wrapper, alias or renamed import with a direct call. `const page = eco.page; export default page({ ... })` and `export default createPage({ ... })` where `createPage` calls `eco.page` both become `export default eco.page({ ... })`; move shared defaults into plain options objects or helper functions that return options. Do the same for `eco.layout`, `eco.component` and `eco.html`, which the build also finds by their literal call.
4. To find every wrapper or alias up front, search `src` for `= eco.page`, `= eco.layout`, `= eco.component`, `= eco.html` and for `import { eco as`.
5. Verify: `ecopages build` completes, and the generated routes (`dist/server/routes.json`) match the pages you expect.
