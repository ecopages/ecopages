# @ecopages/codemod

Codemods that migrate an Ecopages project to the current patterns. Each transform is a [jscodeshift](https://github.com/facebook/jscodeshift) module.

The package follows the Ecopages release train. Use the version that matches the `@ecopages/core` you upgrade to.

## Run

From the project root, with no install:

```bash
npx @ecopages/codemod <transform> [paths...]
```

Paths default to `src`. Extra flags pass through to jscodeshift, so `--dry --print` previews without writing files. `npx @ecopages/codemod --list` prints the transforms. Format the result afterwards, since the raw output indents rewritten lines with extra tabs.

## Transforms

| Transform                   | Added in | Migrates                                                                                                                                                        |
| --------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrate-data-hooks`        | 0.9.0    | `staticProps` and `staticPaths` of `eco.page()` to `props` and `paths`                                                                                          |
| `migrate-to-eco-page`       | 0.3.0    | Module-level data exports and `Page.config` to `eco.page()`; runs the one above                                                                                 |
| `migrate-to-eco-component`  | 0.3.0    | `Component.config` assignments to `eco.component()`                                                                                                             |
| `migrate-core-entrypoints`  | 0.3.0    | Imports from `@ecopages/core` to the role-based entry points                                                                                                    |
| `migrate-middleware-locals` | 0.10.0   | `ctx.locals` assignments of `FileRouteMiddleware` and `Middleware` to `createMiddleware` and `next({ ... })`, and `locals` read in a page's `render` to `props` |

A transform leaves code it cannot rewrite safely unchanged and reports it, so the old API still fails loudly. Rename those by hand. Transforms leave already-migrated code unchanged, so running one twice is safe.

`migrate-middleware-locals` rewrites a middleware annotated `FileRouteMiddleware` or `Middleware`, on its name or with `satisfies`. It moves only unconditional top-level assignments before a single `return next()`, and only when the body uses `ctx` just to read its fields: code that receives `ctx` itself (a helper called with it, a destructured `locals`) could look for a local that `next()` now provides later. It also refuses when anything between the first assignment and `next()` awaits, returns or throws, since an outer stage could read a local the stage had already set before it left. A synchronous call that throws there is not detected. A value that could change before `next()` runs is bound to a `const` where the assignment was, so it keeps its value and evaluation order. The rewritten middleware is a `createMiddleware` result, not a function, so a middleware the same file calls or stores other than in a `middleware` list is reported, and code in other files that calls it directly, such as a test, needs updating by hand. An annotation with type arguments, an API `Middleware` that reads `ctx.query`, `ctx.render` or `ctx.renderPartial` (a `createMiddleware` stage is typed with the page context, which has none of them), and a file where `createMiddleware` already names something else are reported. Any other function that writes `ctx.locals` is reported too.

It also moves the `locals` a page reads in `render` into a new `props` hook and drops `requires`, since `render` no longer receives `locals`. It does so only for a literal `cache: 'dynamic'` page with a `middleware` list and without `props`, whose `render` destructures `locals` and reads it as member chain values outside any condition, loop, `try`, `await` or nested function, since `props` reads every chain on every request. What `props` returns is sent to the browser, so each chain becomes one prop holding only that value (`locals.session.user` becomes `sessionUser`), never a whole session or user object. A page is reported when it passes, calls, indexes or spreads `locals`, reads both a value and a member of it, reads `locals.params` or `locals.query`, or would need a reserved word as a prop name. It leaves `EcoMiddleware<Context>` annotations, assignments in branches, and every other page that declares `requires` or reads `locals` in `render` unchanged. Recast prints new code one key per line, so run your formatter afterwards. It also reports each `interface RequestLocals` declared in a `declare module '@ecopages/core'` block, since the global interface is removed and the augmentation types nothing; pass the declaration file as a path when it sits outside `src` (`npx @ecopages/codemod migrate-middleware-locals src modules.d.ts`). To finish one, make sure a `createMiddleware` stage provides each local it declared, list that middleware on every page or route that reads them, annotate the locals a shared layout entry reads on its factory parameter, then delete the declaration. When the run ends, the CLI prints a migration brief listing each of those as `file:line`, the docs to read, and a prompt to hand to a coding agent.

The release notes of each core version name the transform that goes with its breaking changes.
