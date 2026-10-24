---
'@ecopages/react': minor
---

Wait for `<Suspense>` on the server. React Pages, Layouts and Island Hosts now render a `React.lazy()` component, or any other suspending child, into the HTML instead of its fallback, so `React.lazy()` and `<Suspense>` can be used in `eco.page()` and `eco.layout()` trees. The response is still one complete document; it is not streamed.

A component that throws, or a `React.lazy()` import that rejects, inside a `<Suspense>` boundary still serves that boundary's fallback and the browser retries it. React now also logs the error on the server.
