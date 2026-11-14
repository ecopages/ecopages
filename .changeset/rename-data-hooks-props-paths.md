---
'@ecopages/core': minor
'@ecopages/react': minor
---

Rename the `eco.page()` data hooks `staticProps` and `staticPaths` to `props` and `paths`, and drop the envelopes they returned. `staticProps` also runs for dynamic and revalidating pages, and `staticPaths` also plans Page Browser Graphs for Dynamic Pages, so the Cache Strategy, not the name, decides when they run. `paths` lists the Params known at build; `props` receives Params, from `paths` at build and from the request at run time. A table in the Data Fetching docs shows what each Cache Strategy does with them.

Breaking:

- `staticProps` is `props` and returns the props object, not `{ props }`. `staticPaths` is `paths` and returns `[{ params }]`, not `{ paths }`.
- `eco.page()` throws on a page that still passes `staticProps` or `staticPaths`, naming the `migrate-data-hooks` codemod, instead of dropping the option.
- `GetStaticProps<T>` is `GetProps<T>` and resolves to `T`. `GetStaticPaths` is `GetPaths` and resolves to `PagePath[]`.
- `StaticPath` is `PagePath`, one page that `paths` lists at build.
- The `props` context passes `params` where it passed `pathname: { params }`, so write `props: async ({ params }) => ...` and read `params.slug`, not `pathname.params.slug`.
- `RouteRendererOptions.skipStaticProps` is `skipPropsHook`.
- `@ecopages/react` strips `props` and `paths` from browser code, where it stripped `staticProps` and `staticPaths`.

A static dynamic route no longer needs a `props` hook: a page with `paths` only builds, and its render receives `params`. `paths` is still required there.

### Migration

1. Run the codemod from your project root. It is one self-contained file, so it needs no checkout. Replace `<version>` with the Ecopages version you upgrade to (tags look like `v0.8.0`): `npx jscodeshift@17 --parser tsx --extensions=ts,tsx,js,jsx -t https://raw.githubusercontent.com/ecopages/ecopages/refs/tags/v<version>/packages/codemod/src/transforms/migrate-data-hooks.ts src`. It renames both options inside `eco.page({ ... })`, unwraps the `{ props }` and `{ paths }` returns, and renames the `GetStaticProps`, `GetStaticPaths` and `StaticPath` imports from `@ecopages/*`, and rewrites `{ pathname: { params } }`, `{ pathname }` and `ctx.pathname.params` in `props` to `params`. A hook it cannot unwrap, such as one imported from another file, is left unchanged and reported; a return value it cannot see through becomes `(await value).props` or `(await value).paths` and is reported too. Then run your formatter, since the raw output indents rewritten lines with extra tabs.
2. By hand, for what it reported or missed: search the project for `staticProps`, `staticPaths`, `GetStaticProps`, `GetStaticPaths`, `StaticPath`, `pathname.params` and `skipStaticProps`, in `.ts`, `.tsx`, `.md` and `.mdx` files. Rename each, read `params` where `props` read `pathname.params`, and return the value directly: `return { title }` for `props`, `return posts.map((post) => ({ params: { slug: post.slug } }))` for `paths`. Update code that reads `Page.staticProps` or `Page.staticPaths`, and prose or `.agents` skill files that name them.
3. Verify. Run your type check, which fails on any leftover `GetStaticProps`, `GetStaticPaths`, `StaticPath` or `pathname`, then `ecopages build`. A page that still declares an old option fails with a message that links to the migration steps in the Data Fetching docs. Open one dynamic route and confirm it renders the same props as before.
