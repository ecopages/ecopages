---
'@ecopages/core': minor
---

Support CSS Modules from packages. `import styles from 'ui-kit/button.module.css'` gives the importer the class map and delivers the scoped CSS to the Page, in server builds, browser bundles and development, when the stylesheet Processor declares `cssModules`. The file is scoped by that Processor and by nothing else, and the files its `url()` references name are copied as for any package stylesheet. Without such a Processor the build still fails and names the importing file, the specifier and `@ecopages/lightningcss-processor`. Core exports `toPackageScopeFile` from `@ecopages/core/processor`, the one rule that names the file a package stylesheet is scoped by: the package name and the path inside it, so a Processor's class names do not depend on the folder or the package-manager layout.
