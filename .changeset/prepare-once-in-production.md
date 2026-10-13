---
'@ecopages/core': patch
---

A production render of a Page or explicit view that has not changed skips the dependency work it already did. The assets of its Html template, Layouts and Page, its client entries, and the assets of each component it renders are resolved on its first render and reused after that. A Page whose `dependencies` is a function still resolves them on every render, because they can depend on the props, params and query. Development resolves them on every render as before.
