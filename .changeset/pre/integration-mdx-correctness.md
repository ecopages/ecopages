---
'@ecopages/ecopages-jsx': patch
'@ecopages/mdx': patch
---

Stop registering the JSX MDX loader twice on Bun, and include compiler plugin functions in the MDX transform cache key so swapping remark/rehype/recma plugins no longer reuses a stale compile.
