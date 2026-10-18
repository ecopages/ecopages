---
'@ecopages/core': minor
'ecopages': minor
---

Development file edits now share one debounce window. The watcher marks server modules, Page Browser Graphs, HTML cache entries, and route-module records dirty and notifies the browser once; unopened Pages rebuild on the next request.
