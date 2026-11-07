---
'@ecopages/postcss-processor': minor
---

Drop the browser build loader for imported CSS: core now compiles every stylesheet imported with a binding (`import styles from './card.css'`) through the Processor's `transformStylesheet`, in server builds, browser bundles and `ecopages dev`. `plugins()` returns no build plugin, and the `runtime/` loader files are removed.
