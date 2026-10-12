---
'@ecopages/react-router': patch
---

A production build no longer adds a timestamp query to page module URLs when the router navigates. The router now reads the build mode from `process.env.NODE_ENV`, which the React browser bundle defines.
