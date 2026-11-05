---
'@ecopages/core': minor
---

`eco.page` with explicit `Props` and `Element` type arguments no longer silently drops `requires` narrowing. A call that writes two type arguments together with `requires` is now a type error; write the key union as the third type argument (`eco.page<Props, Element, 'session'>`) or omit the type arguments.
