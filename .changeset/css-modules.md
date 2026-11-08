---
'@ecopages/core': minor
---

Support CSS Modules through the stylesheet Processor. `import styles from './card.module.css'` now gives the component the map of its class names, the same in server builds, browser bundles and development, and the scoped CSS reaches the Page as a stylesheet of the declaration that imports it. A stylesheet Processor opts in with `cssModules: true` on its `stylesheet` capability and returns `exports` from `transformStylesheet`. Without one, importing a CSS Module fails the build and names the importing file and `@ecopages/lightningcss-processor`. Core types the default export in its ambient declarations; named exports and CSS Modules from packages are not supported. In development, an edit that keeps the class map only refreshes the stylesheet, and an edit that changes it also updates the modules that import it.
