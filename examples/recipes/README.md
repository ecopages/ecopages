# Recipes

Each folder is the code behind one page of the Recipes section in the docs (`apps/docs/src/content/docs/recipes/`). The folder is a small Ecopages app that CI typechecks (`pnpm run typecheck`) and builds (`pnpm run smoke:recipes`), and the page includes its files with `file="examples/recipes/<name>/..."` fences, so the code a reader copies is code that builds.

A recipe is app code the reader owns. It is not a package and its folder is not published.

## Add a recipe

1. Create `examples/recipes/<name>/` as a workspace package named `@ecopages/recipe-<name>` with `build` and `typecheck` scripts, and a page that renders something visible at `/`.
2. Add `apps/docs/src/content/docs/recipes/<name>.mdx` and include the fixture files with `file="..."` fences. Wrap a part of a file in `#region <id>` and `#endregion <id>` comments to include only that part with `region="<id>"`.
3. Link the page from `recipes/overview.mdx`.

## Recipes

- [`diagrams`](./diagrams): Mermaid diagrams rendered to inline SVG at build time with Pele.
