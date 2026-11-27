---
'@ecopages/browser-router': minor
---

A prefetch now also warms the images the prefetched page marks as critical: `<link rel="preload" as="image">` in its head and `<img fetchpriority="high">` in its body, the first two, at low priority and once each. `srcset`, `sizes` and `<picture>` sources are honored, so the browser warms the candidate it will use, and lazy or unmarked images are never requested. It is on by default and follows the page prefetch (strategy, `data-eco-no-prefetch`, data saver); set `prefetch: { images: false }` to turn it off, for example when the `viewport` strategy prefetches many pages at once.
