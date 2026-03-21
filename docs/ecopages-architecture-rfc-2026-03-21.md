# Ecopages Architecture RFC - 2026-03-21

## Status

- Status: proposed
- Type: architecture RFC
- Scope: plugin architecture, startup model, server loading, build ownership
- Intended audience: core maintainers and package authors
- Supersedes as the primary decision document:
    - `docs/ecopages-improvement-direction-2026-03-20.md`
    - `docs/ecopages-loader-runtime-analysis-2026-03-21.md`
    - `docs/ecopages-loader-proposal-2026-03-21.md`
- Those documents remain as historical context; this RFC takes precedence on all architectural decisions.

## Summary

Ecopages should keep the architecture established by the recent refactor and refine it, not replace it with a second abstraction stack.

The key decisions in this RFC are:

1. keep `IntegrationPlugin` as the rendering and framework-semantics boundary
2. keep `Processor` as the asset transformation and emission boundary
3. keep `ConfigBuilder.build()` as the place where app-owned build/runtime state is finalized
4. keep `ServerLoader` as the framework-owned server bootstrap and module-loading boundary
5. do not introduce a parallel first-class `LoaderRegistry` architecture at this stage
6. add only the smallest missing contracts needed to simplify the system further

The simplification target is ownership clarity, not more abstraction.

## Motivation

The latest refactor already produced the most important architectural improvements:

- app-owned build/runtime state is now created during config finalization
- browser bundling and server module loading now have named seams
- the Node thin host is transport-oriented instead of bootstrap-heavy
- development invalidation is centralized in a framework service
- HMR is routed through explicit strategies instead of ad hoc wiring

Those changes solved the most important structural problem: too much implicit ownership.

At the same time, the exploratory loader proposal correctly identified several remaining issues:

- React still owns too much generic browser/runtime build policy
- runtime capability requirements should be explicit
- server-side TypeScript execution should remain replaceable
- lifecycle ordering should be clearer and more documented

The mistake would be to answer those issues by introducing a second plugin architecture on top of the first one.

## Problem Statement

Ecopages still has three real architecture problems:

1. some generic policy is still package-owned instead of core-owned
2. plugin lifecycle and contribution ordering are not documented as clearly as they should be
3. the Node execution path is still more heavyweight than the long-term target

Ecopages does not currently have a problem that requires a second top-level abstraction family for file ownership.

Integrations already own file extensions and rendering semantics.
Processors already own asset capabilities and transformations.
Core already owns build assembly and runtime orchestration.

That means the main remaining work is consolidation, not reinvention.

## Goals

- simplify the architecture without discarding the valid refactor work
- make plugin responsibilities explicit and stable
- preserve app-owned build/runtime state
- preserve the thin-host and server-loader direction
- reduce generic build/runtime policy inside integration packages
- leave room for future execution-backend changes without rewriting orchestration

## Non-Goals

- do not redesign Ecopages around a new general-purpose loader system
- do not replace integrations and processors with a new registry model
- do not make JavaScript-only config the main near-term simplification goal
- do not collapse browser bundling and server loading into one backend contract
- do not swap to Rolldown as part of this RFC

## Current Architecture Baseline

The codebase already has these primary ownership boundaries:

### Config Finalization

`ConfigBuilder.build()` finalizes app-owned state, including:

- build adapter
- build manifest
- build executor
- dev graph service
- runtime specifier registry
- node runtime manifest

Primary implementation:

- [packages/core/src/config/config-builder.ts](/Users/andeeplus/github/ecopages/packages/core/src/config/config-builder.ts)

### Integration Boundary

`IntegrationPlugin` is the boundary for rendering semantics, hydration behavior, framework-specific HMR, and framework-owned build contributions.

Primary implementation:

- [packages/core/src/plugins/integration-plugin.ts](/Users/andeeplus/github/ecopages/packages/core/src/plugins/integration-plugin.ts)

### Processor Boundary

`Processor` is the boundary for asset transformation, asset capability declaration, cache ownership, and dev watch behavior.

Primary implementation:

- [packages/core/src/plugins/processor.ts](/Users/andeeplus/github/ecopages/packages/core/src/plugins/processor.ts)

### Build Manifest Boundary

`AppBuildManifest` already gives Ecopages an app-owned plugin assembly model with separate buckets.

Primary implementation:

- [packages/core/src/build/build-manifest.ts](/Users/andeeplus/github/ecopages/packages/core/src/build/build-manifest.ts)

### Server Loading Boundary

`ServerLoader` and `ServerModuleTranspiler` already provide the server bootstrap and server module execution seam.

Primary implementations:

- [packages/core/src/services/server-loader.service.ts](/Users/andeeplus/github/ecopages/packages/core/src/services/server-loader.service.ts)
- [packages/core/src/services/server-module-transpiler.service.ts](/Users/andeeplus/github/ecopages/packages/core/src/services/server-module-transpiler.service.ts)

### Development Invalidation Boundary

`DevelopmentInvalidationService` already centralizes file change classification.

Primary implementation:

- [packages/core/src/services/development-invalidation.service.ts](/Users/andeeplus/github/ecopages/packages/core/src/services/development-invalidation.service.ts)

## Decision

Ecopages should standardize around the existing integration/processor/server-loader architecture and explicitly reject introducing a new first-class loader architecture for now.

### Why

Because the current codebase already has the right major seams. Replacing them with another set of top-level concepts would create overlap in all the places Ecopages is trying to simplify.

The correct next move is:

- narrow contracts
- document lifecycle ordering
- move generic policy into core services
- make runtime capability explicit
- keep execution transports replaceable behind existing boundaries

## Proposed Stable Ownership Model

### Integrations Own Framework Semantics

Integrations are responsible for:

- page and component rendering semantics
- renderer selection
- hydration behavior
- framework-specific HMR strategy
- framework-specific build contributions
- cross-integration boundary policy when applicable

Integrations are not responsible for:

- generic server module execution
- generic asset processing
- generic file invalidation policy
- generic browser bundler orchestration

### Processors Own Asset Semantics

Processors are responsible for:

- asset file capability declaration
- transformation of asset inputs into emitted or referenced outputs
- processor-owned caching
- build/runtime plugin contribution for their asset type
- processor-owned dev watch behavior

Processors are not responsible for:

- page rendering semantics
- route module ownership
- generic server module execution
- framework-wide invalidation policy

### Core Owns Orchestration

Core is responsible for:

- lifecycle ordering
- config finalization
- build manifest assembly
- server loading bootstrap
- development invalidation policy
- runtime capability validation
- browser bundling coordination
- route scanning and rendering orchestration

## Stable Integration Contract

The current `IntegrationPlugin` shape is close to the desired long-term contract.

The code block below shows the **authoring contract** (implemented/overridden by plugin authors), not the full class surface. Internal lifecycle methods like `setConfig()`, `setRuntimeOrigin()`, `setHmrManager()`, `initializeAssetDefinitionService()`, and `initializeRenderer()` are part of the class but are framework-owned and not part of the authoring API.

```ts
interface IntegrationPluginConfig {
	name: string;
	extensions: string[];
	integrationDependencies?: AssetDefinition[];
	staticBuildStep?: 'render' | 'fetch';
	runtimeCapability?: RuntimeCapabilityDeclaration;
}

abstract class IntegrationPlugin<C = EcoPagesElement> {
	readonly name: string;
	readonly extensions: string[];
	readonly staticBuildStep: 'render' | 'fetch';

	abstract renderer: RendererClass<C>;

	get plugins(): EcoBuildPlugin[] {
		return [];
	}

	async prepareBuildContributions(): Promise<void> {}

	async setup(): Promise<void> {}

	async teardown(): Promise<void> {}

	getHmrStrategy?(): HmrStrategy | undefined;

	shouldDeferComponentBoundary(_input: ComponentBoundaryPolicyInput): boolean {
		return false;
	}
}
```

### Notes

- `plugins` remains the declarative build/runtime contribution seam
- `prepareBuildContributions()` remains the pre-startup contribution phase
- `setup()` remains runtime-only initialization
- `getHmrStrategy()` remains integration-owned HMR behavior
- `shouldDeferComponentBoundary()` remains integration-owned cross-render policy

### Explicit Rejection

This RFC rejects adding all of the following to every integration right now:

- `getBuildContributions()`
- `getHtmlHooks()`
- `getDevelopmentHooks()`
- a separate loader-family interface layer

Those additions expand the base contract without solving a current structural gap that the existing lifecycle cannot cover.

## Stable Processor Contract

The current `Processor` shape is also close to the desired long-term contract.

As with the integration contract, the code block below shows the **authoring contract**. Internal helpers like `setContext()`, `getCachePath()`, `readCache()`, `writeCache()`, `matchesFileFilter()`, `getDependencies()`, and `getName()` exist on the class but are framework-owned plumbing.

```ts
interface ProcessorAssetCapability {
	kind: ProcessorAssetKind; // 'script' | 'stylesheet' | 'image'
	extensions?: ProcessorExtensionPattern[];
}

interface ProcessorConfig<TOptions = Record<string, unknown>> {
	name: string;
	description?: string;
	options?: TOptions;
	watch?: ProcessorWatchConfig;
	capabilities?: ProcessorAssetCapability[];
	runtimeCapability?: RuntimeCapabilityDeclaration;
}

abstract class Processor<TOptions = Record<string, unknown>> {
	readonly name: string;

	abstract buildPlugins?: EcoBuildPlugin[];
	abstract plugins?: EcoBuildPlugin[];

	async prepareBuildContributions(): Promise<void> {}
	abstract setup(): Promise<void>;
	abstract process(input: unknown, filePath?: string): Promise<unknown>;
	abstract teardown(): Promise<void>;

	getAssetCapabilities(): ProcessorAssetCapability[];
	canProcessAsset(kind: ProcessorAssetKind, filepath?: string): boolean;
	getWatchConfig(): ProcessorWatchConfig | undefined;
}
```

### Notes

- `capabilities` is already the file ownership declaration for processors
- `buildPlugins` and `plugins` already provide a clean split between build-time and runtime contribution
- `watch` already lets processors own their asset-specific dev reactions

### Explicit Rejection

This RFC rejects replacing processors with `AssetLoader` or `DocumentLoader` types right now.

For Ecopages as it exists today, that would rename the current architecture rather than simplify it.

## Registration Model

The registration model remains `ConfigBuilder`.

### Integrations

```ts
const config = await new ConfigBuilder()
	.setIntegrations([kitajsPlugin(), litPlugin(), reactPlugin({ router: ecoRouter(), mdx: { enabled: true } })])
	.build();
```

### Processors

```ts
const config = await new ConfigBuilder()
	.setProcessors([
		imageProcessorPlugin({
			options: {
				/* ... */
			},
		}),
		postcssProcessorPlugin(
			tailwindV4Preset({
				/* ... */
			}),
		),
	])
	.build();
```

### Why This Stays

This model is already correct because:

- registration is explicit
- validation happens in one place
- app-owned runtime/build state is derived once
- plugin uniqueness rules are enforceable during config finalization

This RFC rejects adding a separate runtime loader registry for integrations and processors.

## Build Contribution Assembly

`AppBuildManifest` remains the core assembly unit.

```ts
interface AppBuildManifest {
	loaderPlugins: EcoBuildPlugin[];
	runtimePlugins: EcoBuildPlugin[];
	browserBundlePlugins: EcoBuildPlugin[];
}
```

Primary implementation:

- [packages/core/src/build/build-manifest.ts](/Users/andeeplus/github/ecopages/packages/core/src/build/build-manifest.ts)

### Contribution Sources

The current implementation assembles contributions by bucket, not as one global linear plugin list:

1. `loaderPlugins` come from the config-owned loader map finalized by `ConfigBuilder`, which includes both user-configured loaders and core-required default loaders
2. `runtimePlugins` are collected during config finalization from processor `plugins` first, then integration `plugins`
3. `browserBundlePlugins` are collected during config finalization from processor `buildPlugins`

At execution time, server builds consume `loaderPlugins + runtimePlugins`, while browser builds consume `loaderPlugins + runtimePlugins + browserBundlePlugins`.

The exact mechanics remain core-owned. Packages should declare contributions, not assemble the manifest themselves.

## Server Loading Model

`ServerLoader` remains the stable boundary for config loading and app entry loading.

```ts
interface ServerLoader {
	loadConfig<T = unknown>(options: ServerLoaderModuleOptions): Promise<T>;
	loadApp<T = unknown>(options: ServerLoaderModuleOptions): Promise<T>;
	rebindAppContext(context: ServerLoaderAppContext): void;
	invalidate(changedFiles?: string[]): void;
	dispose(): Promise<void>;
}
```

### Decision

Future experimentation should happen behind this boundary, not by introducing a new host-owned execution model.

That means Ecopages may later support alternative internal implementations such as:

- esbuild-backed transpilation
- `tsx`-style fast dev transport
- Node native type stripping for config/bootstrap-specific paths

But the orchestration contract should remain the same.

### Thin Host Rule

The thin host remains transport-only.

It may:

- receive startup input
- validate startup input
- construct the runtime adapter
- delegate startup and disposal

It must not own:

- source parsing policy
- tsconfig policy
- package interop policy
- file semantics
- framework lifecycle semantics

## Runtime Capability Declaration

This RFC adopts a small runtime capability declaration model.

```ts
type RuntimeCapabilityTag = 'bun-only' | 'node-compatible' | 'requires-native-bun-api' | 'requires-node-builtins';

interface RuntimeCapabilityDeclaration {
	tags: RuntimeCapabilityTag[];
	minRuntimeVersion?: string;
}
```

### Decision

Add this as a field on:

- `IntegrationPluginConfig`
- `ProcessorConfig`

### Why

This is the smallest useful addition because it enables:

- early startup validation
- clearer runtime-specific package intent
- less launcher-specific guesswork

This RFC explicitly prefers a field-based declaration over a larger hook family.

## Development Invalidation Model

`DevelopmentInvalidationService` remains the framework-owned invalidation policy boundary.

Primary implementation:

- [packages/core/src/services/development-invalidation.service.ts](/Users/andeeplus/github/ecopages/packages/core/src/services/development-invalidation.service.ts)

### Decision

Do not introduce generic `getDevelopmentHooks()` on all plugins at this stage.

Current participation is already clean enough:

- integrations contribute through HMR strategies
- processors contribute through watch configuration
- core owns classification and dispatch

If a new invalidation seam is later needed, it should be added only after a concrete use case proves the current boundary is insufficient.

## HTML And Document Transformation

This RFC does not standardize a broad new HTML hook family yet.

### Why

The gap is real, but the right contract is not yet proven.

Adding `getHtmlHooks()` to all integrations and processors now would widen the surface area before Ecopages has a stable use-case inventory for:

- head tag injection
- full document rewriting
- fragment-level transforms

### Decision

Document this as an open design topic, not an adopted RFC change.

## Rejected Alternative: First-Class Loader Architecture

This RFC explicitly rejects the near-term adoption of:

- `LoaderFamily = 'module' | 'asset' | 'document'`
- `LoaderRegistry`
- `ModuleLoader`
- `AssetLoader`
- `DocumentLoader`
- loader-priority based conflict resolution as a core architecture requirement

### Reasoning

Because in the current Ecopages codebase this would duplicate existing ownership:

- integrations already own renderable source types by extension
- processors already own asset types by capability
- `ServerLoader` already owns server execution transport
- `AppBuildManifest` already owns build contribution assembly

The result would be two partially-overlapping ways to answer the same questions.

That is architecture expansion, not simplification.

## Rejected Alternative: JavaScript-First Config As The Main Refactor Goal

This RFC does not reject JavaScript config as a possible future optimization.

It rejects making that the primary simplification goal right now.

### Reasoning

The current architecture problem is not mainly that `eco.config.ts` is TypeScript.
The current problem is that some ownership is still too spread across packages.

Changing config format without resolving ownership would not deliver the main simplification win.

## Rejected Alternative: Immediate Rolldown Migration

This RFC rejects replacing esbuild with Rolldown as part of the current simplification effort.

### Reasoning

Rolldown may become a strong browser-bundling backend later, but:

- it does not solve current ownership problems by itself
- server loading and browser bundling should remain separate concerns
- migration order matters more than tool preference here

The correct order remains:

1. stabilize ownership and lifecycle boundaries
2. reduce generic policy in integrations
3. keep server execution replaceable behind `ServerLoader`
4. evaluate browser bundler changes later

## Concrete Next Steps

### 1. Add Runtime Capability Support

Implement `runtimeCapability` on integration and processor configs and validate it during config finalization.

### 2. Document Lifecycle Ordering

Add clear core documentation for the plugin lifecycle:

1. config finalization
2. build contribution preparation
3. app startup setup
4. request-time rendering
5. development invalidation and HMR

The current implementation also has meaningful within-phase ordering that should be documented explicitly:

- during config finalization, processors are initialized before build contributions are collected
- during build contribution collection, processors run `prepareBuildContributions()` before integrations
- during runtime startup, processors run `setup()` before integrations

That ordering is currently framework-owned and should stay stable unless a deliberate architecture change requires otherwise.

### 3. Continue Moving Generic React Policy Into Core

Prioritize extraction of generic concerns from React-specific services, especially:

- runtime specifier registration and shared aliasing mechanics
- browser runtime asset entry wiring and generated runtime module assembly
- generic browser bundle orchestration (currently consumed via `BrowserBundleService` in `packages/integrations/react/src/react-hmr-strategy.ts`)

Done when: integrations register runtime specifier maps and runtime entry modules through core-owned seams, React no longer owns browser bundle entry wiring directly, and any future non-React adoption happens only when another integration has a real specifier-mapped browser runtime module use case.

### 4. Keep Server Execution Backend Replaceable

Continue evolving the implementation behind `ServerLoader` without changing the orchestration model.

## Migration Guidance For Package Authors

When deciding where new behavior belongs, use this decision rule:

### Put it in an integration when:

- it is about rendering semantics
- it is framework-specific hydration policy
- it is framework-specific HMR policy
- it is framework-specific boundary behavior

### Put it in a processor when:

- it is about asset transformation
- it is about emitted assets
- it is about asset-specific caching
- it is about asset watch behavior

### Put it in core when:

- it affects startup orchestration
- it affects runtime capability validation
- it affects generic build contribution assembly
- it affects generic invalidation policy
- it affects server execution transport
- it affects browser bundler orchestration across packages

## Acceptance Criteria

This RFC is considered successfully adopted when all of the following are true:

- the main architecture documentation points to one primary RFC
- integrations and processors remain the only top-level plugin authoring model
- runtime capability validation exists as a small typed contract
- server execution transport remains replaceable behind `ServerLoader`
- no new parallel loader registry is introduced during this simplification phase
- generic React-owned browser/runtime policy is reduced further: specifically, runtime specifier registration and browser bundle entry wiring are core-owned, while integration-specific specifier-map contents remain package-owned when they encode framework semantics

## Final Position

The recent refactor was the hard part and it was directionally correct.

The system should now be simplified by tightening the architecture that already exists, not by introducing another one.

Ecopages should keep:

- integrations for framework semantics
- processors for asset semantics
- core-owned config finalization
- core-owned build manifest assembly
- core-owned server loading through `ServerLoader`
- thin runtime hosts

And it should add only the missing minimal pieces required to make that architecture easier to trust.
