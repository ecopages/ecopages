---
'@ecopages/core': minor
'@ecopages/lit': minor
---

Server-render Lit elements in markup another Integration produced. A Lit element whose `ssr: true` script a Kita Component declares now gets its declarative shadow root on a Kita Page and inside a Foreign Subtree spliced into a Lit Page, and Lit's hydration support loads before the element script. Pages with no `ssr: true` script assigned to Lit render as before. Integrations can opt in with the new `renderCustomElements` renderer hook.
