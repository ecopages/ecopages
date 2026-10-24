---
'@ecopages/react': minor
---

Server rendering stops waiting for Suspense after 10 seconds by default, one limit for the whole Page render. Unfinished boundaries stay in their fallback for the browser to retry, the rest of the Page is served, and one warning names the Page. A tree still waiting outside every boundary when the limit fires fails the render instead of serving an empty page. Pass `reactPlugin({ renderTimeoutMs })` to change the limit, a whole number of milliseconds from 1 to 2147483647.
