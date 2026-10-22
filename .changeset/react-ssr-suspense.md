---
'@ecopages/react': minor
---

Wait for `<Suspense>` on the server. React Pages, Layouts and Island Hosts now render a `React.lazy()` component, or any other suspending child, into the HTML instead of its fallback, so `React.lazy()` and `<Suspense>` can be used in `eco.page()` and `eco.layout()` trees. The response is still one complete document; it is not streamed. A suspending child that never settles keeps the render waiting; there is no time limit.

A component that throws, or a `React.lazy()` import that rejects, inside a `<Suspense>` boundary behaves as before: React logs the error, serves that boundary's fallback and the browser retries it.
