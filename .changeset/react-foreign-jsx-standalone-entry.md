---
'@ecopages/react': patch
---

Keep a standalone script entry on its own JSX runtime in a build shared with React. A `.tsx` file another Integration owns, bundled as its own browser entry and imported by no React entry, fell through the foreign-JSX scan as a file it did not find, so React's override compiled it with the React runtime. A Radiant host in such a script then rendered `[object Object]` unless the file carried a `@jsxImportSource` pragma. A foreign entry file now stays with its owner. If a React island also imports such a file, the build now fails with a message that names it, since one module cannot compile two ways.
