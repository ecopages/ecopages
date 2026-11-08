---
'@ecopages/lightningcss-processor': minor
---

Scope CSS Modules. A `*.module.css` file gets class names built from `[hash]_[local]`, hashed from its path relative to the app, so they match across folders; set `cssModules: { pattern }` to change the pattern. `composes` and `composes ... from` work, and the class map lists the composed names after each class.
