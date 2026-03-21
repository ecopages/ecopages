# Ecopages Loader Proposal - 2026-03-21

## Status

- Type: formal architecture proposal
- Scope: loader model, runtime startup shape, server-side module loading
- Depends on: loader/runtime analysis from `ecopages-loader-runtime-analysis-2026-03-21.md`

## Objective

Define a simpler and more explicit architecture for:

- configuration loading
- application startup
- file-type ownership
- server-side module execution
- invalidation and development reload behavior

The proposal is designed to reduce startup complexity while increasing long-term flexibility.

## Problem Statement

Ecopages currently has loader behavior, but it is distributed across several concepts:

- integrations
- processors
- build plugins
- asset-processing services
- runtime transpilation services

This works, but it has three architectural costs:

1. file ownership is not expressed through one clear contract
2. startup complexity is higher than necessary because TypeScript execution and framework bootstrapping are tightly coupled
3. generic loading behavior is often encoded implicitly inside integrations or processors rather than declared explicitly

The result is a system that is extensible, but harder to reason about than it needs to be.

## Proposal Summary

This proposal introduces four main decisions:

1. define configuration loading as a stable JavaScript-first boundary
2. define a stable framework-owned application entry boundary with `app.ts` as the default and config override support
3. introduce explicit loaders as first-class framework contracts
4. move Node TypeScript execution behind a replaceable `ServerModuleLoader` interface

## Design Principles

### 1. Core Owns Orchestration

Core is responsible for:

- lifecycle ordering
- loader registration and precedence
- runtime capability validation
- startup orchestration
- invalidation flow

### 2. Loaders Own File Semantics

Loaders are responsible for:

- file matching or ownership
- transformation behavior
- runtime/build participation
- invalidation classification

### 3. Integrations Own Framework Semantics

Integrations remain responsible for:

- rendering semantics
- hydration behavior
- framework-specific graph policy
- document/runtime conventions that are truly framework-specific

They should not remain the implicit home for generic file loading.

### 4. Adapters Own Transport, Not Meaning

Runtime adapters decide how modules are executed in Bun or Node.

They do not decide:

- what MDX means
- how PostCSS transforms styles
- how a route module is classified

## Proposed Startup Model

### Bootstrap Boundary

The framework should define one stable bootstrap path:

1. load `eco.config.js`, `eco.config.mjs`, or equivalent stable JavaScript config
2. resolve the stable app entry such as `app.ts`, or `config.entrypoint` when provided
3. construct the loader registry
4. validate runtime capabilities
5. delegate server module execution to `ServerModuleLoader`
6. construct the app runtime from the loaded app module

### Config Policy

Recommended policy:

- JavaScript config is always supported
- TypeScript config is optional and implemented as an additional capability, not the baseline
- `app.ts` is the default application entrypoint
- app config may override that default via an `entrypoint` key

This keeps the bootstrap path stable even if the app execution strategy changes later.

Example:

```ts
export default {
	entrypoint: './src/server/app-root.ts',
};
```

This keeps the default simple while allowing more advanced project layouts without introducing a second startup model.

## Loader Model

### Loader Families

The framework should make loader families explicit.

```ts
export type LoaderFamily = 'module' | 'asset' | 'document';
```

#### Module loaders

Used for executable modules loaded on the server.

Examples:

- TypeScript server modules
- JSX and TSX modules
- MDX modules compiled to ESM

#### Asset loaders

Used for files that participate in asset emission or browser graph assembly.

Examples:

- PostCSS
- image optimization
- raw text or content asset imports

#### Document loaders

Used for files that become renderable page or component sources and may bridge into integrations.

Examples:

- MDX pages
- future template formats

### Base Loader Interface

```ts
export type RuntimeName = 'node' | 'bun';

export type LoaderMatch = {
	filePath: string;
	importer?: string;
	runtime: RuntimeName;
};

export type LoaderOutputTarget = 'server-module' | 'browser-module' | 'stylesheet' | 'asset' | 'document';

export type RuntimeCapabilityTag =
	| 'bun-only'
	| 'node-compatible'
	| 'requires-native-bun-api'
	| 'requires-node-builtins';

export interface RuntimeCapabilityDeclaration {
	tags: RuntimeCapabilityTag[];
	minRuntimeVersion?: string;
}

export interface LoaderBase {
	/** Unique framework-visible name. */
	name: string;

	/** High-level loader category. */
	family: LoaderFamily;

	/** Declares runtime compatibility requirements. */
	runtimeCapability?: RuntimeCapabilityDeclaration;

	/**
	 * Returns true when the loader owns the provided file.
	 * Ownership should be deterministic and cheap to evaluate.
	 */
	matches(input: LoaderMatch): boolean;

	/**
	 * Optional priority override. Higher values win when multiple loaders match.
	 * Default is 0.
	 */
	priority?: number;
}
```

### Module Loader Interface

```ts
export interface ModuleLoadContext {
	filePath: string;
	importer?: string;
	runtime: RuntimeName;
	rootDir: string;
	dev: boolean;
}

export interface ModuleLoadResult {
	target: 'server-module' | 'browser-module';
	code: string;
	map?: string;
	dependencies?: string[];
	watchFiles?: string[];
}

export interface ModuleLoader extends LoaderBase {
	family: 'module';
	outputTarget: 'server-module' | 'browser-module';
	loadModule(context: ModuleLoadContext): Promise<ModuleLoadResult>;
}
```

### Asset Loader Interface

```ts
export interface AssetLoadContext {
	filePath: string;
	importer?: string;
	runtime: RuntimeName;
	rootDir: string;
	dev: boolean;
}

export interface AssetReference {
	kind: 'script' | 'stylesheet' | 'asset';
	src?: string;
	content?: string;
	attributes?: Record<string, string>;
}

export interface AssetLoadResult {
	target: 'stylesheet' | 'asset' | 'browser-module';
	assets: AssetReference[];
	watchFiles?: string[];
}

export interface AssetLoader extends LoaderBase {
	family: 'asset';
	outputTarget: 'stylesheet' | 'asset' | 'browser-module';
	loadAsset(context: AssetLoadContext): Promise<AssetLoadResult>;
}
```

### Document Loader Interface

```ts
export interface DocumentLoadContext {
	filePath: string;
	runtime: RuntimeName;
	rootDir: string;
	dev: boolean;
}

export interface DocumentLoadResult {
	target: 'document';
	moduleCode: string;
	dependencies?: string[];
	watchFiles?: string[];
	integrationHint?: string;
}

export interface DocumentLoader extends LoaderBase {
	family: 'document';
	outputTarget: 'document';
	loadDocument(context: DocumentLoadContext): Promise<DocumentLoadResult>;
}
```

### Unified Loader Type

```ts
export type Loader = ModuleLoader | AssetLoader | DocumentLoader;
```

## Loader Registry

The framework should own a registry that resolves loader ownership deterministically.

```ts
export interface ResolveLoaderInput {
	filePath: string;
	importer?: string;
	runtime: RuntimeName;
}

export interface LoaderRegistry {
	register(loader: Loader): void;
	getLoaders(): Loader[];
	resolve(input: ResolveLoaderInput): Loader | null;
}
```

### Registry Rules

The registry should enforce these rules:

- registration order is stable
- loader resolution is deterministic
- priority is explicit, not incidental
- ambiguous ownership should fail loudly in development
- runtime capability incompatibility should fail before execution

Recommended resolution order:

1. matching loaders only
2. highest explicit priority wins
3. ties fail with a clear ambiguity error

This is better than relying on undocumented ordering behavior.

## ServerModuleLoader

This is the key boundary that replaces today’s hardwired transpiler ownership in the Node path.

```ts
export interface ServerModuleImportInput {
	filePath: string;
	runtime: RuntimeName;
	rootDir: string;
	invalidateKey?: string;
}

export interface ServerModuleLoader {
	importModule<T = unknown>(input: ServerModuleImportInput): Promise<T>;
	invalidate(changedFiles?: string[]): void;
	dispose(): Promise<void>;
}
```

### Responsibilities

`ServerModuleLoader` is responsible for:

- loading executable server modules
- caching compiled or transformed results where appropriate
- integrating with development invalidation
- delegating file transformation to the loader registry or internal transform path

It is not responsible for:

- startup orchestration
- route matching
- HTML rendering semantics
- browser bundling policy

### Implementations

The initial architecture should allow multiple implementations:

- `EsbuildServerModuleLoader`
- `TsxServerModuleLoader`
- `NativeStripTypesServerModuleLoader`
- `BunNativeServerModuleLoader`

Not all of these need to exist immediately. The point is to make them possible without changing host orchestration.

## Development Invalidation Hooks

Loaders should be able to participate directly in invalidation behavior.

```ts
export type FileChangeKind = 'browser-only' | 'server-module' | 'asset' | 'config' | 'unknown';

export interface LoaderDevelopmentHooks {
	classifyFileChange?(filePath: string): FileChangeKind | undefined;
}
```

This avoids pushing all file classification logic into one generic watcher with hidden framework assumptions.

## Relationship To Existing Concepts

### Integrations

Integrations remain.

They should continue to define:

- renderer selection
- hydration behavior
- framework-specific HMR semantics
- deferred rendering or boundary policy when truly integration-specific

They should stop owning generic file loading when a loader can own that more honestly.

### Processors

Processors may remain, but their role should narrow.

Good processor responsibilities:

- asset post-processing
- cache-aware optimization passes
- emitted asset enrichment

Less ideal processor responsibilities:

- generic source ownership
- hidden transformation behavior that is effectively a loader

In practice, some current processors may become asset loaders or wrap asset loaders.

### Build Contributions

Loaders may also contribute build-facing information when necessary.

```ts
export interface BuildContributionManifest {
	browserPlugins?: Array<{ name: string; setup(builder: unknown): void | Promise<void> }>;
	serverPlugins?: Array<{ name: string; setup(builder: unknown): void | Promise<void> }>;
	specifierMappings?: Record<string, string>;
	virtualModules?: Array<{
		specifier: string;
		contents: string | (() => string | Promise<string>);
	}>;
}

export interface LoaderBuildHooks {
	getBuildContributions?(): BuildContributionManifest | Promise<BuildContributionManifest>;
}
```

This should remain framework-owned assembly, not setup-time mutation.

## Example Mappings

### PostCSS

Recommended shape:

- asset loader

Owns:

- stylesheet file matching
- stylesheet transformation
- watch-file invalidation hints

Does not need to remain only a processor concept.

### MDX

Recommended shape:

- document loader plus integration bridge

Owns:

- `.mdx` file matching
- MDX-to-module transformation
- declared integration hint for render handoff

Integration still owns:

- how the resulting module is rendered
- hydration or runtime behavior if applicable

### Server TypeScript

Recommended shape:

- module loader behind `ServerModuleLoader`

Owns:

- TS/TSX to executable ESM transformation
- server-module cache invalidation
- runtime-specific execution transport

## Migration Plan

### Stage 1

Add the core loader interfaces and registry without changing runtime behavior.

### Stage 2

Wrap the existing Node transpiler path behind `ServerModuleLoader`.

### Stage 3

Promote one existing capability into a first-class loader.

Best candidate order:

1. PostCSS
2. server TypeScript module loading
3. MDX

### Stage 4

Make JavaScript config the stable bootstrap path.

### Stage 5

Decide whether development startup still needs a runtime manifest or whether stable-entry loading is now sufficient.

## Success Criteria

This proposal is successful when:

- file ownership is expressed through explicit loader contracts
- startup becomes easier to explain and debug
- Node execution strategy can change without rewriting host orchestration
- integrations stop accumulating generic file-loading responsibilities
- development invalidation becomes more explicit and less ad hoc

## Recommendation

Adopt this proposal incrementally.

The most important decision is not whether Ecopages keeps or removes the thin host.

The most important decision is whether Ecopages continues to keep loading behavior implicit.

It should not.

Ecopages should formalize loaders, isolate server-module execution behind a stable interface, and simplify bootstrap around a stable config and app entry boundary.

That would produce a system that is both more flexible and easier to trust.
