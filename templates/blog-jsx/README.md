# Blog JSX template

A content-driven Ecopages JSX blog using `@ecopages/content-processor` for
frontmatter, sorting, and MDX post rendering. UI chrome uses `@ecopages/radiant-ui`
with a cycle theme toggle, feed layout, and heading components.

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

To customize the site, start with `src/pages/index.tsx`, the dynamic post route
in `src/pages/posts/[slug].tsx`, and the shared styles under `src/pages` and
`src/styles`.
