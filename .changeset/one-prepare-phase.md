---
'@ecopages/core': minor
'@ecopages/ecopages-jsx': minor
'@ecopages/mdx': minor
'@ecopages/react': minor
'@ecopages/content-processor': minor
'@ecopages/image-processor': minor
'@ecopages/postcss-processor': minor
'ecopages': minor
---

Plugins and Processors have one build phase. Core reads each `plugins(app)` once while finalizing the config and runs nothing else of a Processor there, so a Processor whose `setup()` fails no longer fails config loading, and collection generation, image syncing and PostCSS config loading no longer run during finalization.

The content processor generates its collection modules in `setup()`, and a build that resolves a collection before then waits for the same generation. PostCSS loads its plugin list on the first stylesheet transform. `ecopages build` and `ecopages preview` now empty `dist/` and set Processors up before the router reads any Page, so a dynamic Page's `getStaticPaths()` can read what a Processor generates in `setup()`. The image processor restores and optimizes images in `setup()` and no longer has a Lit worker guard, because core already skips Processor setup in the Lit worker.

**Breaking:**

- `Processor.prepareBuildContributions()` and `IntegrationPlugin.prepareBuildContributions()` are gone. Move the work that reads or writes files into `setup()`, and the plugin list into `plugins(app)`. When a build can run before `setup()`, start the work from the plugin's own callback and share one promise between callers.
- `plugins` is a method, `plugins(app: EcoPagesAppConfig): EcoBuildPlugin[]`, on `Processor` and `IntegrationPlugin`, no longer a getter or a field. Change `get plugins() { return [...] }` and `plugins = [...]` to `override plugins(app) { return [...] }`. It must not do I/O, and `Processor` no longer requires subclasses to declare it: the default returns no plugins.
- `ecopages types` now sets the Processors up, because they write their virtual-module types in `setup()`. Image optimization and the first PostCSS pass run as part of it.
- `PostCssProcessorPlugin.processSync()` is gone. It had no callers and ran no PostCSS plugin until a `transformStylesheet()` call had loaded them; use `transformStylesheet()`.
- `sealAppBuildManifest()` is synchronous.
