---
'@ecopages/core': patch
---

Fix incremental static export serving stale pages after a content edit. Files under a Processor's watch paths, such as content collection entries, are now build inputs: when one is added, removed, or edited, the next `ecopages build` clears the production caches and renders every page again.
