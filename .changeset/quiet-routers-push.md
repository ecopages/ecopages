---
'@ecopages/react-router': patch
---

Fix `useRouter().navigate()` not updating the address bar. It now pushes a history entry like a link click, so reload and back behave correctly, and accepts `{ replace: true }` to replace the current entry instead.
