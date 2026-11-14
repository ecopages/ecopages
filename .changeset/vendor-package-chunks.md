---
'@ecopages/core': patch
---

Give each installed package of the production browser build a chunk of its own, `vendor-<package>-[hash].js`, whose name and bytes depend only on that package. React, React DOM, Lit, the router and app dependencies stay cached across deploys when app code changes, and a page loads only the vendor chunks of the packages it imports. Development already serves every bare import from the vendor graph.
