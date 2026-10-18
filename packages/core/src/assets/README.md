# Asset Processing

This directory owns shared browser-build coordination and processed-asset pipelines.

Asset processing reads per-app state from the `AppRuntime` installed during config finalization. Each Integration owns an `AssetProcessingService` and its processed-asset cache. App-wide browser builds use the shared build queue, so static export can combine route assets before SSR requests.

## Purpose

Asset processing centralizes app-wide browser builds and processor-owned asset transformations.

Typical responsibilities include:

- asset factories, processors, and the processed-asset cache
- app-wide browser build coordination and runtime asset declarations

## Main Areas

- `asset-processing-service/`: the only processed-asset cache, plus typed processors and asset factories. Dependency identity includes attributes, position, and package role; grouped results are reused only while their complete dependency sets match.
- `app-browser-client-build.ts`: combines static-export renderer plans, route islands, lazy client entries, and HTML Page module scripts into compatible app-wide groups. `app-browser-client-manifest.ts` persists route associations so `ecopages start` can restore outputs before SSR requests. Non-exact route templates receive a parameter-free plan without running route data hooks; later params reuse its output when dependencies match, with request-time fallback for a new graph.
- `browser-bundle.service.ts`: coordinates browser builds for assets and HMR. Production outputs record their content-addressed paths in `hashed-browser-asset.ts` for `immutable` file caching; development keeps source-relative names so CSS HMR can refresh the same URL.

The asset-processing service owns the only processed-asset cache for its five processors. Dependency identity includes attributes, position and package role; file outputs retain their source path so development can verify freshness and invalidate imported inputs. Grouped and ungrouped processing share that cache, and a complete grouped result is reused only while its full dependency set matches. Integration-owned processing calls pass their Integration, whose optional `prepareAssetDependencies()` hook runs before dispatch; calls without an owning Integration pass `undefined`. The file-script processor reads the current HMR manager through the service getter rather than retaining a separately forwarded manager.

Grouped script assets share one processing path for file and content entries and use exact entry facade output lookup, so Page names such as `blog` and `blog-post` cannot select one another's hydration output. Static export combines compatible grouped entries from every Integration and the HTML shell scripts into app-wide browser build groups, then attaches each emitted entry to its routes. The ordinary grouped cache reuses outputs only when the complete dependency-key set matches; entries from differently composed Page builds are never mixed. Grouped builds carry each entry's external modules, define values, and plugin instances; conflicting define values fail before bundling.
In development, each applied change batch is announced on the shared build-input index, and every asset-processing service evicts the cached assets whose source or bundled inputs it touched. Shared layout styles are therefore not rebuilt for every navigated page, and a bundle is never served after one of its imports changed.

Browser runtime module assets resolve bare package roots through their ESM import target. For legacy packages without an `exports` map, they prefer `package.json#module` over CJS `main`; CJS resolution is only a compatibility fallback. Generated entries use `export *` for ESM files and explicit named re-exports for CJS files (so bindings such as React `jsx` exist on the vendor). A default binding is added only when the selected entry exposes one. Runtime vendors are package-root contracts: subpath imports need their own vendor declaration or remain in the consuming bundle.

Package entry lookup is rooted at the application directory, so a framework-local dependency with the same name cannot shadow the application's installed package. ESM export conditions are evaluated in the same order as the generated vendor import (`node`, `import`, then `default`).

## Design Rule

Shared asset processing belongs here; framework-specific asset declarations stay with their Integration.
