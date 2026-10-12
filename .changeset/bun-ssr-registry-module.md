---
'@ecopages/core': patch
'@ecopages/lit': patch
---

Server-render inferred Lit custom elements in a Bun production build. Each registry imports its own copy of the SSR script, because Bun does not re-evaluate a module that has called `customElements.define` when only the URL query changes.
