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
`src/content/posts`, where each MDX file uses `title`, `description`, `excerpt`,
and optional numeric `order` frontmatter.

To customize the site, start with `src/pages/index.tsx`, the dynamic post route
in `src/pages/posts/[slug].tsx`, and the shared styles under `src/pages` and
`src/styles`.
