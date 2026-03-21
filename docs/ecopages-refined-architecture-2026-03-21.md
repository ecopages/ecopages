# Ecopages Refined Architecture Strategy — 2026-03-21

## Status

- Type: consolidated architecture proposal
- Supersedes: `ecopages-improvement-direction-2026-03-20.md`, `ecopages-loader-proposal-2026-03-21.md`, `ecopages-loader-runtime-analysis-2026-03-21.md`
- Objective: simplify and consolidate the integration/processor/loader model building on top of the latest refactoring

## Context

Three architecture documents were produced during this cycle. Each explored a valid direction but grew independently — the resulting surface area is too broad to act on cleanly.

Meanwhile, the latest refactoring commit already moved the codebase forward significantly:

- `ConfigBuilder.build()` now seeds one app-owned build adapter, manifest, executor, dev graph, and runtime registry
- `BrowserBundleService` is the shared browser build seam
- `ServerModuleTranspiler` (wrapped by `TranspilerServerLoader`) is the shared server-loading seam
- `DevelopmentInvalidationService` centralises file-change classification
- `AppBuildManifest` has clean buckets: `loaderPlugins`, `runtimePlugins`, `browserBundlePlugins`
- HMR flows through named strategies instead of ad hoc wiring

The cleanup is real and not lost. The goal now is to define the minimal next step: clarify the `IntegrationPlugin` and `Processor` contracts, make registration explicit, and reduce the surface area of the plugin model to what it actually needs.

## Guiding Principle

Simplify by narrowing contracts, not by adding layers.

The three earlier documents proposed loaders, hook families, HTML hooks, config hooks, development hooks, runtime capability declarations, a loader registry, and a server-module loader abstraction. That is too many new concepts at once.

The refactored codebase already has most of the needed seams. What it needs is cleaner interfaces at the integration and processor boundary — not a parallel loader system.

## What Each Concept Should Own

### Integration

An integration owns **rendering and framework semantics for a component paradigm**.

Responsibilities:

- knows how to render a component tree to HTML (server rendering)
- knows how to produce hydration assets for the browser (client rendering)
- knows what file extensions it handles
- knows its HMR strategy (if any)
- knows its component boundary deferral policy (cross-integration rendering)
- may contribute build plugins that are specific to its rendering model (e.g. MDX-to-React compilation)

Does not own:

- generic asset processing (that is a processor concern)
- generic file watching (that is core/processor concern)
- generic server-module loading (that is core concern)

### Processor

A processor owns **asset transformation and emission for specific file types**.

Responsibilities:

- knows what file types it processes (declared via capabilities)
- transforms input files into processed output (CSS, images, etc.)
- contributes build plugins for both server and browser pipelines
- manages its own cache
- optionally watches files and reacts to changes in dev mode

Does not own:

- rendering or hydration (that is an integration concern)
- server-module execution (that is core concern)
- HTML template structure (that is core/integration concern)

### Core

Core owns **orchestration, lifecycle ordering, and shared services**.

Responsibilities:

- config building and validation
- build manifest assembly from integration/processor contributions
- server-module loading and transpilation
- browser bundling coordination
- development invalidation classification
- HMR strategy selection and dispatch
- route scanning and matching
- HTML transformation pipeline

## Proposed Integration Interface

The current `IntegrationPlugin` base class is close to right. The changes below are narrowing, not expanding.

```ts
import type { EcoBuildPlugin } from '../build/build-types';
import type { HmrStrategy } from '../hmr/hmr-strategy';
import type { IntegrationRenderer } from '../route-renderer/integration-renderer';

type RendererConstructor<C> = new (options: RendererInitOptions) => IntegrationRenderer<C>;

interface RendererInitOptions {
	appConfig: EcoPagesAppConfig;
	assetProcessingService: AssetProcessingService;
	resolvedIntegrationDependencies: ProcessedAsset[];
	runtimeOrigin: string;
}

interface IntegrationPluginConfig {
	name: string;
	extensions: string[];
	integrationDependencies?: AssetDefinition[];
	staticBuildStep?: 'render' | 'fetch';
}

abstract class IntegrationPlugin<C = EcoPagesElement> {
	readonly name: string;
	readonly extensions: string[];
	readonly staticBuildStep: 'render' | 'fetch';

	abstract renderer: RendererConstructor<C>;

	/** Build plugins contributed by this integration (e.g. MDX loader). */
	get plugins(): EcoBuildPlugin[] {
		return [];
	}

	/** Pre-build: materialize build contributions (loaders, plugins). */
	async prepareBuildContributions(): Promise<void> {}

	/** Runtime setup: resolve dependencies, initialize renderer. */
	async setup(): Promise<void> {}

	/** Cleanup. */
	async teardown(): Promise<void> {}

	/** HMR strategy for this integration, if any. */
	getHmrStrategy?(): HmrStrategy | undefined;

	/** Cross-integration boundary deferral policy. */
	shouldDeferComponentBoundary(input: ComponentBoundaryPolicyInput): boolean {
		return false;
	}
}
```

### What changes from today

The current `IntegrationPlugin` already has this shape. The only recommended changes are:

1. **Stop adding new methods to the base class.** The earlier proposal wanted to add `getBuildContributions()`, `getHtmlHooks()`, `getDevelopmentHooks()`, `getRuntimeCapability()`. That is too much surface area. The existing `prepareBuildContributions()` + `plugins` getter + `setup()` lifecycle is sufficient.

2. **Formalize integration dependency declaration.** The `integrationDependencies` array is the right pattern. It already handles React runtime bundles, Lit hydration scripts, etc. No new mechanism needed.

3. **Keep renderer ownership simple.** The integration provides a `RendererConstructor<C>`, core creates the instance. The renderer itself is where framework-specific rendering logic lives.

### How Integrations Register

Registration already happens through `ConfigBuilder`:

```ts
const config = await new ConfigBuilder()
	.setIntegrations([
		kitajsPlugin(),
		litPlugin(),
		reactPlugin({
			router: ecoRouter(),
			mdx: { enabled: true },
		}),
	])
	.build();
```

This is the right model. No registry abstraction needed.

During `build()`, the config builder:

1. validates uniqueness of integration names and extensions
2. calls `setConfig(appConfig)` on each integration
3. calls `prepareBuildContributions()` on each integration
4. collects `plugins` from each integration into the app build manifest

### Concrete Integration Examples

#### KitaJS (minimal)

```ts
class KitaHtmlPlugin extends IntegrationPlugin {
	renderer = KitaRenderer;

	constructor(options?) {
		super({ name: 'kitajs', extensions: ['.kita.tsx'], ...options });
	}
}
```

No build plugins, no HMR strategy, no dependencies. Just a renderer and an extension.

#### React (full-featured)

```ts
class ReactPlugin extends IntegrationPlugin<React.JSX.Element> {
  renderer = ReactRenderer;

  constructor(options?: ReactPluginOptions) {
    super({ name: 'react', extensions: ['.tsx', ...mdxExts] });
    // wire up: router adapter, runtime bundle service, MDX compiler
    this.integrationDependencies.unshift(...runtimeBundleService.getDependencies());
  }

  get plugins(): EcoBuildPlugin[] {
    return this.mdxLoaderPlugin ? [this.mdxLoaderPlugin] : [];
  }

  async prepareBuildContributions(): Promise<void> {
    await this.ensureMdxLoaderPlugin();
  }

  getHmrStrategy(): HmrStrategy | undefined {
    return new ReactHmrStrategy(this.hmrManager.getDefaultContext(), ...);
  }

  shouldDeferComponentBoundary(input): boolean {
    return input.targetIntegration === 'react' && input.currentIntegration !== 'react';
  }
}
```

Build plugins (MDX loader), HMR strategy, dependency declaration, boundary policy — all through the existing contract.

## Proposed Processor Interface

The current `Processor` base class is also close to right. The changes below narrow and clarify.

```ts
interface ProcessorAssetCapability {
	kind: 'script' | 'stylesheet' | 'image';
	extensions?: string[];
}

interface ProcessorWatchConfig {
	paths: string[];
	extensions?: string[];
	onCreate?: (ctx: ProcessorWatchContext) => Promise<void>;
	onChange?: (ctx: ProcessorWatchContext) => Promise<void>;
	onDelete?: (ctx: ProcessorWatchContext) => Promise<void>;
}

interface ProcessorConfig<TOptions = Record<string, unknown>> {
	name: string;
	description?: string;
	options?: TOptions;
	watch?: ProcessorWatchConfig;
	capabilities?: ProcessorAssetCapability[];
}

abstract class Processor<TOptions = Record<string, unknown>> {
	readonly name: string;

	/** What file types this processor handles. */
	getAssetCapabilities(): ProcessorAssetCapability[];

	/** Can this processor handle a file of the given kind/path? */
	canProcessAsset(kind: ProcessorAssetKind, filepath?: string): boolean;

	/** Build-only plugins (bundler transforms). */
	abstract buildPlugins?: EcoBuildPlugin[];

	/** Runtime plugins (file processing during dev). */
	abstract plugins?: EcoBuildPlugin[];

	/** Pre-build: resolve config, materialize contributions. */
	async prepareBuildContributions(): Promise<void> {}

	/** Runtime setup. */
	abstract setup(): Promise<void>;

	/** Process an input file. */
	abstract process(input: unknown, filePath?: string): Promise<unknown>;

	/** Cleanup. */
	abstract teardown(): Promise<void>;

	/** Optional dev-mode watch config. */
	getWatchConfig(): ProcessorWatchConfig | undefined;

	/** Built-in JSON cache read/write. */
	protected readCache<T>(key: string): Promise<T | null>;
	protected writeCache<T>(key: string, data: T): Promise<void>;
}
```

### What changes from today

Again, very little needs to change. The main recommendation is:

1. **Separate `buildPlugins` from `plugins` clearly.** This already exists — `buildPlugins` for build-time, `plugins` for runtime. Keep it.

2. **Asset capabilities as the ownership declaration.** The `capabilities` array with `kind` + `extensions` pattern matching is the right mechanism. It already answers "does this processor handle `.css` files?" without a separate loader registry.

3. **No separate loader abstraction for processors.** The earlier proposal wanted to introduce `AssetLoader` and `DocumentLoader` types. That is unnecessary — the current `Processor` with `capabilities` + `buildPlugins` + `plugins` already serves as the asset loading boundary.

### How Processors Register

Same pattern through `ConfigBuilder`:

```ts
const config = await new ConfigBuilder()
  .setProcessors([
    imageProcessorPlugin({ options: { ... } }),
    postcssProcessorPlugin(tailwindV4Preset({ ... })),
  ])
  .build();
```

During `build()`:

1. validates no duplicate processor names
2. calls `setContext(appConfig)` on each processor (sets up cache dir)
3. calls `prepareBuildContributions()` on each processor
4. collects `buildPlugins` and `plugins` into the app build manifest

### Concrete Processor Examples

#### PostCSS (stylesheet processor)

```ts
class PostCssProcessorPlugin extends Processor<PostCssProcessorPluginConfig> {
  constructor(config) {
    super({
      name: 'postcss-processor',
      capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }],
      watch: { paths: ['src'], extensions: ['.css'], onChange: ..., onCreate: ... },
      ...config,
    });
  }

  get buildPlugins(): EcoBuildPlugin[] {
    return [this.createAsyncCssLoaderPlugin()];
  }

  get plugins(): EcoBuildPlugin[] {
    return [this.createSyncCssLoaderPlugin()];
  }

  async prepareBuildContributions(): Promise<void> {
    await this.resolvePostcssPlugins();
  }

  async setup(): Promise<void> {
    await this.prewarmCssCache();
  }

  async process(input: string, filePath: string): Promise<string> {
    return await this.postcssProcessor.process(input, filePath);
  }
}
```

Capabilities declare it handles CSS. Build plugins provide the CSS loader for bundling. Runtime plugins provide the CSS loader for dev. Watch config handles live CSS updates.

#### Image Processor

```ts
class ImageProcessorPlugin extends Processor<ImageProcessorConfig> {
  constructor(config) {
    super({
      name: 'image-processor',
      capabilities: [{ kind: 'image', extensions: ['*.{jpg,jpeg,png,webp}'] }],
      watch: { paths: [sourceDir], onCreate: ..., onChange: ..., onDelete: ... },
      ...config,
    });
  }

  get buildPlugins(): EcoBuildPlugin[] {
    return [this.createImageBundlerPlugin()];
  }

  get plugins(): EcoBuildPlugin[] {
    return [this.createImageRuntimePlugin()];
  }

  async prepareBuildContributions(): Promise<void> {
    await this.processImages();
    await this.generateVirtualModuleTypes();
  }

  async process(imageBuffer: unknown): Promise<unknown> {
    return await this.imageProcessor.process(imageBuffer);
  }
}
```

## Build Manifest Assembly

The `AppBuildManifest` already has the right shape:

```ts
interface AppBuildManifest {
	loaderPlugins: EcoBuildPlugin[];
	runtimePlugins: EcoBuildPlugin[];
	browserBundlePlugins: EcoBuildPlugin[];
}
```

The config builder assembles this from:

1. **Default loaders** (eco-component-meta-plugin)
2. **Integration `plugins`** (e.g. React's MDX loader)
3. **Processor `buildPlugins`** (build-time) and **`plugins`** (runtime)
4. **Config `loaders`** (user-registered build plugins)

This is already what `collectConfiguredAppBuildManifestContributions()` does. No new registry needed.

## Server Module Loading

The `TranspilerServerLoader` wrapping `ServerModuleTranspiler` is the right abstraction:

```ts
interface ServerLoader {
	loadConfig<T>(options: ServerLoaderModuleOptions): Promise<T>;
	loadApp<T>(options: ServerLoaderModuleOptions): Promise<T>;
	rebindAppContext(context: ServerLoaderAppContext): void;
	invalidate(changedFiles?: string[]): void;
	dispose(): Promise<void>;
}
```

This already:

- separates config loading from app loading
- supports context rebinding as the app config evolves
- integrates with development invalidation
- abstracts over the underlying transpilation mechanism

The only recommended future change is making the transpiler backend pluggable behind the `ServerLoader` interface (esbuild today, potentially tsx or native type stripping later). That is already architecturally possible without changing the `ServerLoader` contract.

## Development Invalidation

The `DevelopmentInvalidationService` already provides the right classification:

```ts
type DevelopmentInvalidationCategory =
	| 'public-asset'
	| 'additional-watch'
	| 'include-source'
	| 'route-source'
	| 'processor-owned-asset'
	| 'server-source'
	| 'other';

interface DevelopmentInvalidationPlan {
	category: DevelopmentInvalidationCategory;
	invalidateServerModules: boolean;
	refreshRoutes: boolean;
	reloadBrowser: boolean;
	delegateToHmr: boolean;
	processorHandledAsset: boolean;
}
```

Processors participate through their watch config. Integrations participate through their HMR strategy. Core owns the classification and dispatch. This is already working correctly.

## What The Earlier Proposals Got Right

1. **The principle that core owns orchestration and plugins contribute declaratively.** This is already happening through `prepareBuildContributions()` and the build manifest.

2. **The idea of a `ServerModuleLoader` boundary.** Already implemented as `ServerLoader` / `TranspilerServerLoader`.

3. **Development invalidation as a framework service.** Already implemented as `DevelopmentInvalidationService`.

4. **Runtime capability declarations.** Worth adding as a lightweight field on integration/processor configs, but as a simple tag array — not a separate hook family.

## What The Earlier Proposals Over-Engineered

1. **Loader families and LoaderRegistry.** The current model already distributes file ownership correctly: integrations handle page/component files by extension, processors handle asset files by capability declaration, core loaders handle meta-concerns like the component-meta plugin. A parallel `LoaderRegistry` with `ModuleLoader` / `AssetLoader` / `DocumentLoader` types would duplicate this without adding value.

2. **Four hook families (config, build, HTML, development).** The existing lifecycle is sufficient: `prepareBuildContributions()` covers config and build timing, `setup()` covers runtime, the existing HMR/watch system covers development. Adding `getHtmlHooks()`, `getDevelopmentHooks()`, `getBuildContributions()`, and `getRuntimeCapability()` as four separate methods on every plugin is over-engineering.

3. **JS-first config as a new bootstrap model.** The current `eco.config.ts` + esbuild pre-compilation works. Simplifying the bootstrap path is worth doing incrementally (e.g. config-phase native type stripping), but a new config format is not the highest priority.

4. **Formal loader resolution with priority and ambiguity errors.** The current model resolves files unambiguously: integration extensions are validated unique, processor capabilities use kind + extension matching, config loaders are keyed by name. No priority-based resolution is needed.

## What Should Actually Change Next

### 1. Add Runtime Capability Tags

Add a simple `runtimeCapability` field to both `IntegrationPluginConfig` and `ProcessorConfig`:

```ts
type RuntimeCapabilityTag = 'bun-only' | 'node-compatible' | 'requires-native-bun-api' | 'requires-node-builtins';

interface RuntimeCapabilityDeclaration {
	tags: RuntimeCapabilityTag[];
	minRuntimeVersion?: string;
}
```

`ConfigBuilder.build()` validates capabilities at startup.

### 2. Make Processor Build Plugin Contribution Automatic

Currently `collectConfiguredAppBuildManifestContributions()` already collects from integrations and processors. Verify this assembly is complete and document the contribution order:

1. config loaders (eco-component-meta-plugin, user loaders)
2. integration plugins (MDX loader, etc.)
3. processor build plugins
4. processor runtime plugins

### 3. Clean Up React-Specific Generics

Move the following from React-specific implementation into core-owned services:

- **Runtime specifier registration** — integrations should expose their browser runtime specifier maps through a shared lifecycle hook, while the framework owns registry attachment and alias-plugin infrastructure.
- **Browser runtime asset factories** — The `BrowserRuntimeAssetFactory` and `BrowserRuntimeEntryFactory` in core are the right place, and integrations should reuse them instead of assembling runtime entry files themselves.

Do not force a non-React integration onto the runtime-specifier-map seam unless it actually emits browser runtime modules that must be addressable through bare imports. A dependency-only hydration helper, such as Lit's current inline hydration support, is not the same thing.

### 4. Document The Plugin Lifecycle

Create clear documentation for the lifecycle phases:

```
1. ConfigBuilder.build()
   a. validate integrations (unique names, unique extensions)
   b. validate processors (unique names)
   c. initialize default loaders
   d. setContext() on each processor
  e. prepareBuildContributions() on each processor
  f. prepareBuildContributions() on each integration
   g. collect all plugins into AppBuildManifest
   h. create build adapter, executor, dev graph, specifier registry

2. App startup (createApp)
  a. setup() on each processor
  b. setup() on each integration (resolve dependencies, init renderer)
  c. register HMR strategies and runtime specifier maps

3. Request handling
   a. route matching
   b. integration renderer dispatch
   c. HTML transformation

4. Development
   a. file change -> DevelopmentInvalidationService classification
   b. HMR strategy selection and dispatch
   c. processor watch handlers
```

## Registration And Wiring Summary

```
eco.config.ts
  |
  v
ConfigBuilder
  .setIntegrations([kitajsPlugin(), reactPlugin(...), litPlugin()])
  .setProcessors([postcssProcessorPlugin(...), imageProcessorPlugin(...)])
  .setLoaders([customLoader])       // optional user build plugins
  .build()
  |
  v
AppBuildManifest
  loaderPlugins:         [eco-component-meta, custom-loader]
  runtimePlugins:        [react-mdx-loader, postcss-runtime, image-runtime]
  browserBundlePlugins:  [postcss-build, image-bundler]
  |
  v
createApp({ appConfig })
  |-- integration.setup() for each integration
  |-- HMR strategies registered
  |-- server ready
```

## Conclusion

The latest refactoring already established the right ownership boundaries. The system does not need:

- a new loader abstraction layer
- four new hook families
- a loader registry with priority resolution
- a new config format

What it needs is:

- runtime capability declarations (small, typed tag field)
- documented lifecycle ordering
- continued narrowing of integration-specific code that belongs in core services
- incremental cleanup of the server-module loading path toward pluggable backends

Keep the architecture the codebase already has. Refine it, do not replace it.
