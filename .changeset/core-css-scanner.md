---
'@ecopages/core': patch
---

Plain CSS with no Processor now works in a production build: core inlines the relative `@import`s of an app stylesheet (with their `layer`, `supports` and media conditions), copies the files the imported partials reference, and rebuilds the stylesheet in development when a partial changes or appears. A missing partial warns and names the importing file.

One CSS scanner now serves every stylesheet path, so `image-set()` strings, escapes and `@import` conditions are read the same way when linking a stylesheet, bundling a Page's stylesheets and warning about relative URLs in an HTML Page.
