---
'@ecopages/core': patch
'@ecopages/react': patch
---

React Pages hydrate their own Page, Layout, Html, and include content through the page bootstrap without extra per-component island scripts. React components rendered inside a Page owned by another Integration receive their own hydration scripts.
