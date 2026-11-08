---
'@ecopages/core': minor
---

`*.module.<ext>` is a CSS Module only when the stylesheet capability that declares `<ext>` sets `cssModules`, the same rule the generated declarations already followed. With `{ extensions: ['*.css'], cssModules: true }` and `{ extensions: ['*.scss'] }`, `card.module.scss` is a plain stylesheet typed as a `string`; before, it was classified as a CSS Module and the build failed with "returned no exports". `.module.css` stays a CSS Module.

`ecopages build` now fails when an app module binds a CSS Module that no Eco declaration reaches, such as a module loaded only through `import()` or `export *`: its CSS never reached a Page and nothing said so. The error names both files; `ecopages dev` warns once instead. Import the module, or the CSS Module, from an `eco.page()`, `eco.layout()`, `eco.html()` or `eco.component()` module.
