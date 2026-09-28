# Changelog

## 0.2.0

### Minor Changes

- [`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee) Thanks [@andeeplus](https://github.com/andeeplus)! - React routes hydrate from reachability analysis of the page graph. Nested `eco.page({ layout: [Outer, Inner] })` composes on the server through `composeDocumentShell`. Mixed-integration authoring uses `@ecopages/react/eco-embed`. Enable React MDX with `reactPlugin({ mdx: { enabled: true } })`; `@ecopages/mdx` is a runtime dependency of this package.

    Server-rendered React island hosts stay in the document during hydration and are layout-transparent (`display: contents`). Use `eco.layout()` for layout values so they enter the client graph.

### Patch Changes

- Updated dependencies [[`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee), [`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee), [`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee)]:
    - @ecopages/core@0.2.0
    - @ecopages/file-system@0.2.0
    - @ecopages/mdx@0.2.0

All notable changes to `@ecopages/react` are documented here.

> Changelog tracking begins at version `0.2.0`. Prerelease history lives in git tags and GitHub Releases.
