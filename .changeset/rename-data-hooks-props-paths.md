---
'@ecopages/core': minor
'@ecopages/react': minor
'@ecopages/content-processor': minor
---

Rename the `eco.page()` data hooks `staticProps` and `staticPaths` to `props` and `paths`, and drop the envelopes they returned. `staticProps` also runs for dynamic and revalidating pages, and `staticPaths` also plans Page Browser Graphs for Dynamic Pages, so the Cache Strategy, not the name, decides when they run. `paths` lists the Params known at build; `props` receives Params, from `paths` at build and from the request at run time. A table in the Data Fetching docs shows what each Cache Strategy does with them.

Breaking:

- `staticProps` is `props` and returns the props object, not `{ props }`. `staticPaths` is `paths` and returns `[{ params }]`, not `{ paths }`.
- `eco.page()` throws on a page that still passes `staticProps` or `staticPaths`, naming the `migrate-data-hooks` codemod, instead of dropping the option.
- `GetStaticProps<T>` is `GetProps<T>` and resolves to `T`. `GetStaticPaths` is `GetPaths` and resolves to `StaticPath[]`.
- `RouteRendererOptions.skipStaticProps` is `skipPropsHook`.
- `@ecopages/react` strips `props` and `paths` from browser code, where it stripped `staticProps` and `staticPaths`.

A static dynamic route no longer needs a `props` hook: a page with `paths` only builds, and its render receives `params`. `paths` is still required there.

### Migration

1. Run the codemod from a checkout of the Ecopages repository at the release ref that matches your `@ecopages/core` version, with an absolute path to your project's source directories: `pnpm --filter @ecopages/codemod exec jscodeshift -t src/transforms/migrate-data-hooks.ts --parser tsx --extensions=ts,tsx /path/to/project/src`. It renames both options inside `eco.page({ ... })`, unwraps the `{ props }` and `{ paths }` returns, and renames the `GetStaticProps` and `GetStaticPaths` imports from `@ecopages/*`. A hook it cannot unwrap, such as one imported from another file, is left unchanged and reported.
2. Search the project for `staticProps`, `staticPaths`, `GetStaticProps`, `GetStaticPaths` and `skipStaticProps`, in `.ts`, `.tsx`, `.md` and `.mdx` files. Rename every hit the codemod reported or missed. For each remaining hook, return the value directly: `return { title }` for `props`, `return posts.map((post) => ({ params: { slug: post.slug } }))` for `paths`. Update code that reads `Page.staticProps` or `Page.staticPaths`, and prose or `.agents` skill files that name them.
3. Verify. Run your type check, which fails on any leftover `GetStaticProps` or `GetStaticPaths`, then `ecopages build`. A page that still declares an old option fails with a message naming `migrate-data-hooks`. Open one dynamic route and confirm it renders the same props as before.
