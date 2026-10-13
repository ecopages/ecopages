---
'@ecopages/core': minor
'@ecopages/postcss-processor': minor
'@ecopages/content-processor': minor
---

Processors transform stylesheets through an optional `transformStylesheet(css, file)` method instead of the abstract `process()`, which core only ever called for stylesheets.

**Breaking:**

- `Processor.process()` is gone and a subclass no longer has to implement it. Delete the override. A Processor that transformed stylesheets in `process(input, filePath)` implements `transformStylesheet(css, file): Promise<string>` instead; both arguments are strings and the result is the new stylesheet.
- A Processor takes part in stylesheet processing only when it has `transformStylesheet()` and declares a `stylesheet` capability that matches the file. Core no longer runs a Processor without capabilities because its name contains `postcss`; add `capabilities: [{ kind: 'stylesheet' }]`.
- `PostCssProcessorPlugin.process()` is now `transformStylesheet()`, and its file path argument is required.
- `ContentProcessorPlugin.process()` is gone. Core never called it; the watch callbacks keep their own behaviour.
