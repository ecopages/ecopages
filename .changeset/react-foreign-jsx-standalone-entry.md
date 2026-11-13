---
'@ecopages/react': patch
---

Keep a standalone script entry on its own JSX runtime in a build shared with React. A `.tsx` file another Integration owns, imported by nothing and bundled as its own browser entry, fell through the foreign-JSX scan as a file it did not find, so React's override compiled it with the React runtime. A Radiant host in such a script then rendered `[object Object]` unless the file carried a `@jsxImportSource` pragma. The scan now counts a foreign entry file as reached by itself.
