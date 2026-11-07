---
'@ecopages/core': minor
---

Give `import styles from './card.css'` the same processed CSS in every environment. Server builds, browser bundles and the `ecopages dev` transform server now all compile a stylesheet imported with a binding through the app's stylesheet Processor into `export default "<css>"`, so an `ssr: true` Lit component renders its styles inside the declarative shadow root instead of an empty `<style>`, and a component whose CSS uses `@apply` is styled in development. A side-effect stylesheet import that reaches a build, such as one inside a package, becomes an empty module in browser bundles too, instead of failing the build or being run through the CSS Processor; its CSS does not reach the Page. An error the stylesheet Processor throws fails `ecopages build`; in development the transform server keeps serving the last compiled module and shows the error until a save compiles again.

CSS HMR now refreshes only the link of the stylesheet that changed: the `css-update` event carries the exact href the source was delivered at, and a module that imports the stylesheet as text gets a module `update` with the new CSS.

Breaking: core's stylesheet module plugin runs before every Processor and Integration build plugin, so a build plugin's `load` hook for a stylesheet no longer runs; a Processor transforms stylesheets through `transformStylesheet`. `BuildOptions.stylesheetExtensions` is replaced by `BuildOptions.stylesheets` (`{ extensions, compileModule }`), which core's build requests set. `IClientBridge.cssUpdate(sourceFile)` takes the stylesheet source whose output changed and sends the href it resolves; a custom Processor that passed a source path keeps working, and one that passed an href must pass the source file instead.
