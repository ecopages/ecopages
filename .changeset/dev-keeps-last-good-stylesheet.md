---
'@ecopages/core': patch
---

Keep `ecopages dev` usable while a stylesheet is broken. A Page request now renders with the stylesheet's last good output instead of answering 500, and renders without the stylesheet link when it never compiled since the dev server started. The same holds for the server build of a module that imports a stylesheet or CSS Module with a binding, which now gets the last good CSS or class map. The error shows in the browser overlay, also on a page that loads after the request, and a later HMR update no longer clears it. The next good save clears the overlay and updates the page. `ecopages build` and `ecopages start` still fail on a broken stylesheet. `IHmrManager` gains `reportBuildError(source, message)`.
