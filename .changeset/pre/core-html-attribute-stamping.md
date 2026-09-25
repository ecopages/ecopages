---
'@ecopages/core': patch
---

Attribute stamping on the `<html>` element, the body root and island roots now uses the HTML rewriter instead of regular expressions:

- Tags inside comments and scripts no longer match, and `>` inside a quoted attribute value no longer breaks stamping.
- Quotes in stamped values are escaped.
- An attribute the element already has is replaced instead of duplicated.
- Stamped attributes now follow the element's existing attributes.

HTML dependency injection is also about twice as fast on large pages.
