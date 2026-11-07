---
'@ecopages/core': patch
'@ecopages/react': patch
---

Scope React's Foreign Subtree boundary to the trees and calls that need it. React wraps a Component another Integration owns in `<eco-foreign-subtree>` only in a tree the browser hydrates, a hydrating React Page or a React Island, so a foreign `<tr>`, `<td>` or `<option>` in a React tree that never hydrates stays in its table or select and child-combinator CSS no longer sees an extra element. In the browser, React takes over a foreign Eco Component only while it renders; on a Lit, Kita or Ecopages JSX Page with a React Island, another Integration's browser code calling its own `eco.component` gets its own result instead of a React element. A custom `BrowserForeignChildHost` must implement `isRendering()`.
