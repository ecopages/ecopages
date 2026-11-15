---
'@ecopages/react': patch
---

Keep a script that a Page bundles with other scripts on its own JSX runtime in an app that also has React. Core bundles a Page's scripts through one generated entry that imports each script by absolute path, and React's foreign-JSX scan did not follow absolute imports, so it compiled such a `.tsx` script with the React runtime. A Radiant host in the script then rendered `[object Object]` unless the file carried a `@jsxImportSource` pragma. The scan now follows absolute imports, and the script keeps its owner's runtime. A production build where a React island and such a script import the same foreign `.tsx` file now fails with a message that names it, as it already did for an ungrouped script, instead of compiling that file for React.
