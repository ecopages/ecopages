# Blog React template

A content-driven React blog using `@ecopages/content-processor` for frontmatter,
sorting, and MDX post rendering.

## Setup

```bash
npm install
npm run dev
```

The template runs without external services. Posts live in
`src/content/posts` and double as guides to Ecopages, the content
processor, RSS, and sitemap generation. Each MDX file uses `title`, `description`,
`excerpt`, ISO `date` (`YYYY-MM-DD`), and an `image` import name from `ecopages:images`.
Posts are sorted newest-first by `date`. Pages call `resolvePostImage()` to map
frontmatter to explicit named imports for `EcoImage`. Allowed import names live in
`src/content/post-image-imports.ts` so config can validate the schema without
loading the virtual module.

On startup, `app.ts` writes an RSS feed to `src/public/rss.xml`; restart dev
or run a build after changing posts to regenerate it. Production builds also
emit `sitemap.xml` (error pages excluded; `/rss.xml` listed via
`extraUrls`). Set `ECOPAGES_BASE_URL` to your production origin before
`ecopages build` so both files use absolute URLs.

The content processor validates that frontmatter at scan time. `reactPlugin`
also needs `withContentMdxPlugins()` so MDX compile strips the `---` block
instead of rendering it as content. See `src/lib/mdx-plugin-options.ts`.

The post Page renders the server MDX component during SSR, then preloads the
browser MDX component before React hydrates or navigates to a post. Markdown,
React components, and components from other configured Ecopages integrations
therefore work in a post exactly as they do in a normal React MDX page; declare
component dependencies in MDX as usual.

To customize the site, start with `src/pages/index.tsx`, the dynamic post Page
in `src/pages/posts/[slug].tsx`, and the shared styles under `src/pages` and
`src/styles`.
