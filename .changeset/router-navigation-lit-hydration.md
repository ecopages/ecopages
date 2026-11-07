---
'@ecopages/core': minor
'@ecopages/react': patch
'@ecopages/react-router': patch
---

A React router navigation into a Page with a Lit Component now hydrates the element's server-rendered shadow root. Before, the navigation did not load Lit's hydration support before the Page module, which imports `lit-element`, so the element rendered itself on the client and Chrome logged "Found declarative shadowrootmode attribute on a template". The router now loads the next document's global scripts, Lit's hydration support among them, before it imports the Page module, and the React boundary of a Foreign Subtree inserts its server HTML with `setHTMLUnsafe()`, which keeps declarative shadow roots.

An Integration's global scripts are now tagged with `data-eco-global-script` in the page head, and `@ecopages/core/client` exports `loadNavigationGlobalScripts()` for a router that needs them in place before it imports a Page.
