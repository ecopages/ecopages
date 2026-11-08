---
'@ecopages/core': minor
---

Import the classes of a CSS Module by name: `import { primary } from './button.module.css'`. Each class whose name is a valid JavaScript identifier is a named export, the same in server builds, browser bundles and development; other names, such as `is-active`, stay on the default export, and no name is renamed. `ecopages types` now writes one declaration per CSS Module into `node_modules/@types/ecopages-css-modules`, with the default map and the named exports keyed by the class names, and development rewrites a declaration when its CSS Module changes. TypeScript finds the declarations through `rootDirs` (and an extra `paths` candidate for an alias such as `@/*`) that list that folder: add `"rootDirs": ["./src", "./node_modules/@types/ecopages-css-modules"]` to `tsconfig.json`. Then an unknown class fails type checking.
