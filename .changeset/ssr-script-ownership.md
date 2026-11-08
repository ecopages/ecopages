---
'@ecopages/core': minor
'@ecopages/lit': patch
'@ecopages/ecopages-jsx': patch
---

An `ssr: true` script is now evaluated on the server by one preloader, the one for the Integration that owns it. With Radiant, a script on an Ecopages JSX Component goes to Ecopages JSX. Lit evaluates the scripts of Lit Components and of Components whose Integration has no preloader, such as Kita or React. Before, Lit also evaluated Radiant scripts on a Lit Page, so Radiant's server graph loaded twice.

A Page also lists every Integration's global scripts in config order, before its Component scripts, whichever Integration owns it. Before, the owning Integration's came after the foreign ones.

Breaking:

- An Integration with a custom-element preloader declares which scripts it evaluates with `ssrScriptPreload` (`'own'` or `'own-and-foreign'`) on `IntegrationPlugin`, and its renderer gets the preloader from `createSsrScriptPreloader()` in the hook factory options.
