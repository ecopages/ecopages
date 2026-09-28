---
'@ecopages/react': minor
---

React routes hydrate from reachability analysis of the page graph. Nested `eco.page({ layout: [Outer, Inner] })` composes on the server through `composeDocumentShell`. Mixed-integration authoring uses `@ecopages/react/eco-embed`. Enable React MDX with `reactPlugin({ mdx: { enabled: true } })`; `@ecopages/mdx` is a runtime dependency of this package.

Server-rendered React island hosts stay in the document during hydration and are layout-transparent (`display: contents`). Use `eco.layout()` for layout values so they enter the client graph.
