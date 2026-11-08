---
'@ecopages/react': patch
---

Scope React's Foreign Subtree boundary to the trees that hydrate. React wraps a Component another Integration owns in `<eco-foreign-subtree>` only in a hydrating React Page or a React Island that gets an Island Host, so a foreign `<tr>`, `<td>` or `<option>` in a React tree that never hydrates stays in its table or select and child-combinator CSS no longer sees an extra element.
