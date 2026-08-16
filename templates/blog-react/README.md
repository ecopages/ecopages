# Blog React template

A content-driven React blog using `@ecopages/content-processor` for frontmatter,
sorting, and MDX post rendering.

## Setup

```bash
npm install
npm run dev
```

The template runs without external services. Posts live in
`src/content/posts`, where each MDX file uses `title`, `description`, `excerpt`,
and optional numeric `order` frontmatter.

The content processor validates that frontmatter at scan time. `reactPlugin`
also needs `withContentMdxPlugins()` so MDX compile strips the `---` block
instead of rendering it as content. See `src/lib/mdx-plugin-options.ts`.

To customize the site, start with `src/pages/index.tsx`, the post layout in
`src/lib/post-page.tsx`, and the shared styles under `src/pages` and
`src/styles`.
