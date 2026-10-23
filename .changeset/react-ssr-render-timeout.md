---
'@ecopages/react': minor
---

Server rendering stops waiting for Suspense after 10 seconds by default. Unfinished boundaries stay in their fallback for the browser to retry, the rest of the Page is served, and one warning names the Page. Pass `reactPlugin({ renderTimeoutMs })` to change the limit.
