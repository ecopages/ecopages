---
'@ecopages/core': minor
---

Core names the stylesheet extensions once, and an app allows one stylesheet Processor. A file is a stylesheet when it is `.css` or has an extension the registered stylesheet Processor declares in its `stylesheet` capability, and `.module.<ext>` for those extensions is a CSS Module. Discovery, the server CSS shim, the dev transform server and the stylesheet pipeline all follow that rule, so `import './card.scss'` is now discovered, kept out of the server build and served in development when a Processor declares `*.scss`, and is left alone when none does. Core no longer treats `.scss`, `.sass` and `.less` as stylesheets by themselves.

Breaking: config finalization now fails when two Processors declare a `stylesheet` capability, naming both, and `transformStylesheet` no longer runs through a chain of Processors in registration order. Register one stylesheet Processor and combine any further steps inside it.

A stylesheet `url()` may now copy `.apng`, `.jxl`, `.tif`, `.mov` and `.m4a` files, and `url(var(--x))` is skipped without a warning that shows a garbled path.
