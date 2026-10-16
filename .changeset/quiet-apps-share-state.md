---
'@ecopages/core': minor
'@ecopages/mdx': minor
---

**Breaking:** Direct users of `@ecopages/core/diagnostics/request-pipeline-metrics` and the custom-element SSR preloader must pass the owning app runtime's state. Direct users of `@ecopages/mdx/core` and `@ecopages/mdx/mdx-loader-plugin` must pass `requestPipelineMetrics` when creating the MDX loader; obtain it from `requireAppRuntime(appConfig).requestPipelineMetrics`.

Keep HTML Page warning state, custom-element SSR preload scopes, and request pipeline metrics on each app runtime. A config module can export `defineConfig(() => ({ ... }))` to create fresh integrations, processors, and loaders for multiple apps in one process. Reusing any integration, processor, or loader instance in another app now errors, including when a config factory returns fresh config objects.
