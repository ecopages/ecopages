---
'@ecopages/core': minor
'@ecopages/browser-router': minor
---

Browser-router always morphs the incoming body so persisted nodes stay connected and keep their scroll and lifecycle state when their ancestor structure remains compatible, including when View Transitions are disabled or rerun scripts are present. Rerun scripts refresh matching non-persisted nodes so event handlers do not stack. This is a breaking change: the core navigation-pipeline result no longer exposes a body-swap strategy, and the public browser-router `DomSwapper` no longer has a replacement method. Custom runtimes must choose their own body-swap behavior, and browser-router users should use `morphBody`.
