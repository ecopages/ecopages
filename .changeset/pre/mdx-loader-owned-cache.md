---
'@ecopages/mdx': patch
'@ecopages/react': patch
---

Each MDX loader now owns its compile cache, keyed by file path and reused while the source is unchanged. This replaces a process-wide cache keyed by a serialized fingerprint of the compiler options. Plugin options that hold RegExps, Maps or circular values no longer collide or throw, and memory stays bounded by the number of MDX files.

React now reuses its single MDX loader for server builds, browser bundles and HMR rebuilds instead of creating one per build. Custom code that set `ReactRendererConfig.mdxCompilerOptions` should pass `getMdxLoaderPlugin` instead.
