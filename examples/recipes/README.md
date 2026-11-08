# Recipes

Each folder is the code behind one page of the Recipes section in the docs (`apps/docs/src/content/docs/recipes/`). The folder is a small Ecopages app that CI typechecks (`pnpm run typecheck`) and builds (`pnpm run smoke:recipes`), a Playwright spec under `e2e/fixtures/recipes/` runs it where its behavior needs a server or a browser, and the page includes its files with `file="examples/recipes/<name>/..."` fences, so the code a reader copies is code that builds.

A recipe is app code the reader owns. It is not a package and its folder is not published.

## Add a recipe

1. Create `examples/recipes/<name>/` as a workspace package named `@ecopages/recipe-<name>` with `build` and `typecheck` scripts, and a page that renders something visible at `/`. Where the recipe's behavior needs a server or a browser, add a spec under `e2e/fixtures/recipes/` and a project for it in `playwright.config.ts`.
2. Add `apps/docs/src/content/docs/recipes/<name>.mdx` and include the fixture files with `file="..."` fences. Wrap a part of a file in `#region <id>` and `#endregion <id>` comments to include only that part with `region="<id>"`.
3. Link the page from `recipes/overview.mdx`.

## Recipes

- [`diagrams`](./diagrams): Mermaid diagrams rendered to inline SVG at build time with Pele.
- [`gfm`](./gfm): GitHub-flavoured Markdown and build-time syntax highlighting in MDX.
- [`wasm-threads`](./wasm-threads): the `headers` option for cross-origin isolation and a module Worker on shared memory.
- [`auth-gate`](./auth-gate): a layout that gates its page on the session, and a redirecting page.
- [`components-and-layouts`](./components-and-layouts): plain functions beside `eco.component()` and `eco.layout()`.
