---
'@ecopages/core': minor
---

Link package stylesheets on the Page. A side-effect import such as `import 'react-day-picker/style.css'`, in a declaration or in a plain component it imports, no longer fails the build: it is discovered like local CSS, attached to the nearest declaration, linked once in development and production, and recorded in the asset ledger so `ecopages start` serves it. A specifier ending in `.css` resolves through the package's `exports` with the `style` condition first; any other specifier, such as `import 'swiper/css'`, counts only when the package resolves it to a `.css` file.

Fonts and images the stylesheet references with a relative `url()` are emitted under content hashes and the references rewritten. CSS Processors such as PostCSS and Tailwind do not run on package stylesheets. The build fails when such a `url()` names a missing file or the stylesheet has an `@import` with media, `supports()` or `layer` conditions. CSS Modules still fail the build.
