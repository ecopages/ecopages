---
'@ecopages/core': patch
'ecopages': patch
---

Start `ecopages` commands faster. The CLI reads what it needs to plan the launch from a new `@ecopages/core/cli` entry instead of the `build` and `config` entries, so it no longer loads the bundler before it starts the app.
