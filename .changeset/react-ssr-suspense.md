---
'@ecopages/react': minor
---

Wait for `<Suspense>` on the server. React Pages, Layouts and Island Hosts now render a `React.lazy()` component, or any other suspending child, into the HTML instead of its fallback, so `React.lazy()` and `<Suspense>` can be used in `eco.page()` and `eco.layout()` trees. The response is still one complete document; it is not streamed. A suspending child that never settles keeps the render waiting; there is no time limit.

A render now fails when a component inside a `<Suspense>` boundary throws, a rejected `React.lazy()` import included. Before, that boundary's fallback was served and the error was left to the browser. To leave a subtree to the browser, wrap it in `ClientOnly` instead of throwing on the server.
