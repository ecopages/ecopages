---
'@ecopages/core': minor
---

Builds call build plugin hooks only for modules they can match. The `onResolve` and `onLoad` filters of every build plugin, and the filters of source transforms, now reach the bundler as hook filters, so a module that no filter matches is resolved and loaded without calling into JavaScript.

**Breaking:**

- The bundler tests `onResolve` and `onLoad` filters against ids whose path separators are normalized to `/`, also on Windows. A filter that matches `\` separators no longer matches there; write `/` or `[\\/]`.
- A build plugin must register its `onResolve`, `onLoad`, and `module` handlers before `setup` returns or its promise resolves. A later call throws, because the bundler reads hook filters before the build starts.
