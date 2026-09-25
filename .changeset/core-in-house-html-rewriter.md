---
'@ecopages/core': patch
---

Final HTML injection now uses a built-in streaming rewriter with the same output as Bun's `HTMLRewriter` (lol-html) on every runtime. The `@worker-tools/html-rewriter` dependency and the Node string fallback are gone.

- `HtmlTransformerService.transform()` now returns the `Response` synchronously. Existing `await` calls still work.
- Removed `HtmlTransformerService.setHtmlRewriterMode()` and the `HtmlTransformerServiceOptions` constructor options. There is only one rewriter now, so there is nothing to select.
