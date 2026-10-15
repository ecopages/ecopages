---
'@ecopages/core': patch
'@ecopages/mdx': patch
---

Builds that differ only in the browser runtime manifest, the project's tsconfig path aliases or the MDX compiler options no longer share one build identity, so a deduplicated or reused build cannot hand one configuration the output of another.
