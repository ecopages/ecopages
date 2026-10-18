# HTML

Core's HTML utilities rewrite rendered documents and parse source markup for HTML Pages.

## Document rewriting

`HtmlRewriter` streams markup through a focused subset of the HTMLRewriter element API. Its tag selectors and insertion methods follow the output pinned against lol-html in `html-rewriter.test.ts`.

`HtmlTransformerService` injects processed assets and document contributions supplied for one render. It does not hold queued per-render dependencies, so overlapping renders cannot consume each other's head or body contributions. Generated URLs and attribute values are escaped before tags are written.

## Source parsing

`html-tokenizer.ts` holds the lexical rules shared by `HtmlRewriter` and `html-source-parser.ts`. The positional parser exposes source offsets for callers that splice existing markup, including [HTML Pages](../html-pages/README.md).
