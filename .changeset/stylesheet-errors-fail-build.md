---
'@ecopages/postcss-processor': minor
'@ecopages/core': patch
---

Fail the build when PostCSS cannot process a stylesheet. `PostCssProcessor.processPath`, `processStringOrBuffer` and `processStringOrBufferSync` now throw instead of returning an empty string, so `ecopages build` no longer writes an empty stylesheet and exits 0, and `ecopages dev` shows the error overlay with the file, line and column and keeps the last good stylesheet until the file is fixed. The first successful save after a failure always clears the overlay, even when its output equals the last good one, so no restart is needed. PostCSS warnings are logged with their file and line, and a stylesheet's warnings, including core's missing `url()` reference warning, are logged once instead of once per processing pass.
