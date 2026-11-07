---
'@ecopages/core': patch
---

A Page now loads the global scripts of every Integration it uses before its Component scripts, also when another Integration owns the Page. Before, a foreign Integration's global scripts came last, so on a Kita, React or Ecopages JSX Page Lit's hydration support ran after a server-rendered element was defined, and the element rendered its template a second time instead of hydrating.
