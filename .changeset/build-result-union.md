---
'@ecopages/core': minor
---

`BuildResult` is a `BuildSuccess` or a `BuildFailure`. A successful build always has its outputs, warnings, loaded inputs, dependency graph, entry outputs and output graph, where they used to be optional, and a failed build has only its logs. Logs are `BuildLog`s rather than Rolldown's `RolldownLog`, and carry `message`, `code`, `plugin`, `hook`, `id`, `loc`, `frame` and `stack`.

**Breaking:** code that reads `result.outputs` or `result.logs` without checking `result.success` first no longer type-checks, and a `BuildAdapter` or `BuildExecutor` of your own must return the new shapes. Rolldown's `binding`, `exporter`, `ids`, `meta`, `names`, `pluginCode`, `pos`, `reexporter`, `url` and `cause` are no longer copied onto a log.
