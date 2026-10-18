---
'@ecopages/core': minor
---

An HTML Page `<script src>` without `type="module"` is compiled on its own as a classic script, whether it is JavaScript or TypeScript: types are stripped, `this` stays the global object, its top-level functions stay global, and in production it is minified without renaming them. Any `tsconfig.json` is ignored, so the output depends on the file alone. A classic script that is JSX (`.jsx` or `.tsx`), uses `import`, `export`, `import.meta` or `import x = require()`, imports a relative file with `import()`, has a top-level `await`, or needs a compile helper such as one for a decorator is an error asking for `type="module"`, instead of failing in the browser.

Script assets accept `classic: true`, which compiles the file as a classic script instead of bundling it. HTML Pages set it for these classic scripts.
