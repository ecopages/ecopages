---
'@ecopages/core': patch
---

`@ecopages/core/processor` exports `tokenizeCss`, which splits a stylesheet into comment, string, escape, `url()`, word, whitespace and punctuation tokens, so a Processor can read the structure of CSS without mistaking a `{` or `;` inside a string, comment or escape for it.
