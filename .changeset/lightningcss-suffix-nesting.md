---
'@ecopages/lightningcss-processor': patch
---

A stylesheet with Sass-style suffix nesting, such as `.button { &--primary { ... } }` or `&__element`, now fails the build instead of losing the rule without a message. Native CSS nesting cannot concatenate selectors, so the rule never matched. The error names the file, line, column and the selector, and says to write the full selector, such as `.button--primary`. In development it shows in the error overlay and the last good stylesheet stays until a save fixes it.
