---
'@ecopages/lit': patch
---

Stop replacing `console.warn` when the Lit Integration loads. On the server, a development reload re-registers a Lit custom element without a duplicate-definition warning. A second definition during production SSR throws.
