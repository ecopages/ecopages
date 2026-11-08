---
'ecopages': minor
---

The official templates now style with `@ecopages/lightningcss-processor` and its Tailwind v4 preset instead of PostCSS: `jsx`, `react`, `react-shadcn`, `html`, `lit-jsx`, `radiant`, `blog-jsx`, `blog-react`, `docs-starter`, `react-better-auth` and `llm-wiki`. The generated class set is the same. `jsx-lightningcss` is removed because `jsx` is now that template; use `--template jsx`. Two new templates keep PostCSS for apps that need PostCSS plugins or Tailwind v3: `jsx-postcss` and `react-postcss`.
