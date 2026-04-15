# Marker Simplification Reset

## Checkpoint On 2026-04-15

The branch is at a valid commit boundary now.

What is already true:

- route-level full marker fallback has been removed
- shared orchestration now owns foreign boundary delegation and execution-scoped renderer reuse
- explicit page, layout, and document shell composition has moved onto shared renderer-owned helpers
- Lit, Kita, MDX, Ecopages JSX, GHTML, and React explicit render paths were updated to use those helpers
- focused core validation passed and the latest full `bun test:all` run completed successfully

What is not done yet:

- the remaining marker compatibility subsystem still exists in core
- React still influences the shape of the remaining compatibility lane
- there is not yet a renderer-specific end-to-end migration that deletes the compatibility machinery outright

## Immediate Next Step

The next implementation step should not be another broad shared-core refactor.

It should be one constrained renderer migration that proves the final deletion path.

Recommended next target:

1. choose Lit as the first renderer-specific migration target
2. replace its remaining compatibility placeholder usage with renderer-owned nested boundary handoff
3. keep authoring ergonomics stable for existing `children?: unknown` and `unsafeHTML(...)` patterns
4. validate the resulting shape against kitchen-sink mixed routes before touching React

Exit criteria for that next step:

- Lit no longer depends on shared marker compatibility for nested foreign boundaries in its renderer-owned path
- no new promise-shaped authoring burden leaks into normal Lit component code
- the change makes at least one core compatibility responsibility deletable instead of merely bypassed

## Original Request

The goal from the start was not to optimize around the current marker system.

The goal was:

- remove the marker-based island architecture as a core concept
- avoid the current double-pass model: render top-to-bottom, emit markers, then resolve bottom-to-top
- keep existing functionality
- preserve behavioral tests, especially e2e behavior
- reduce cognitive debt, not just move complexity around
- improve type clarity and reduce cross-package leakage
- prefer deletion of architecture over additive abstractions

## What Was Expected

The requested outcome was a major simplification.

That means the real success criteria are closer to:

- delete large parts of the marker graph subsystem
- remove shared orchestration branches that only exist for marker resolution
- reduce the number of concepts needed to understand nested mixed-integration rendering
- make the renderer-owned path the main path, not a special-case optimization

Small local cleanups do not satisfy that goal on their own.

## What Happened So Far

### Planning and research

- The current architecture was reviewed across core orchestration, graph extraction, graph execution, render preparation, render execution, and concrete renderers.
- Astro was researched as a comparison point.
- The conclusion was that Astro does not expose a generic cross-framework bottom-up marker graph in the same way this codebase does.

### Behavior-locking tests added

Behavior-first tests were added in core orchestration to preserve:

- no marker artifacts in final route HTML
- nested mixed-integration child ordering
- renderer-produced assets and root attributes during nested SSR

These tests are useful and should be kept unless replaced by stronger coverage.

### Wrong turn that was later reverted

A generic core abstraction was added for inline deferred boundary resolution.

This was the wrong direction for the stated goal because:

- it added new generic machinery in core
- it kept the old marker machinery alive
- it created an optimization lane instead of deleting architecture

That generic core abstraction was later removed.

### Actual simplifications that remain

Some renderer-owned explicit paths were simplified:

- Kita explicit `renderToResponse()` no longer routes through shared capture-plus-finalize
- Lit partial explicit renders no longer route through shared marker finalization
- Ecopages JSX partial explicit renders no longer route through shared marker finalization
- Ecopages JSX no longer resolves HtmlTemplate twice in the explicit full-document path
- one dead Lit branch was removed after the partial early-return change

These are real simplifications, but they are small relative to the original request.

## Why This Still Falls Short

The central marker architecture is still in place.

The following core pieces still exist and remain the real target if the goal is major simplification:

- `packages/core/src/route-renderer/component-graph/component-marker.ts`
- `packages/core/src/route-renderer/component-graph/component-graph.ts`
- `packages/core/src/route-renderer/component-graph/component-graph-executor.ts`
- `packages/core/src/route-renderer/component-graph/marker-graph-resolver.ts`
- the marker-resolution loop in `packages/core/src/route-renderer/orchestration/render-execution.service.ts`
- the marker-wrapping behavior in `packages/core/src/route-renderer/orchestration/component-render-context.ts`
- the nested marker-resolution support in `packages/core/src/route-renderer/orchestration/integration-renderer.ts`

This means the current codebase still fundamentally works like this:

1. render under a context that can emit markers
2. capture props and slot linkage for deferred nodes
3. build a graph from marker HTML plus captured refs
4. resolve bottom-up through renderer dispatch

That is the architecture the user wanted to remove.

## Measured Size Of The Real Deletion Target

Approximate line counts of the live marker-related core files that still matter:

- `component-marker.ts`: 109
- `component-graph.ts`: 214
- `component-graph-executor.ts`: 84
- `marker-graph-resolver.ts`: 192

Subtotal for the explicit graph subsystem: about 599 lines before tests.

But the architecture also leaks into larger orchestration files:

- `component-render-context.ts`: 518
- `render-execution.service.ts`: 331
- `integration-renderer.ts`: 1017

And the hardest integration dependency is still:

- `packages/integrations/react/src/react-renderer.ts`: 878

So the user expectation of large deletion is reasonable. The real deletion is large. It just was not attempted directly yet.

## Current State Of The Branch

### Changes that are reasonable to keep

- behavior-first orchestration tests that lock SSR output contracts
- Kita explicit render simplification
- Lit partial explicit render simplification
- Ecopages JSX partial explicit render simplification
- Ecopages JSX redundant HtmlTemplate lookup removal

### Changes that should be reviewed critically

- any changelog wording that overstates the amount of simplification
- any tests that only validate incremental internal reshaping rather than real architectural deletion

## Correct Restart Target

If the next pass is meant to satisfy the original request, the target should be:

### Replace marker orchestration as a core rendering model

That means:

1. introduce a renderer-owned recursive nesting contract that can resolve child boundaries directly without generic marker graph staging
2. move mixed-integration nesting responsibility to the renderer contract instead of the shared graph executor
3. keep React as the explicit hard case rather than the reason the marker model survives everywhere

### Delete the marker graph subsystem

The intended deletion target for a successful major simplification is:

- delete `component-marker.ts`
- delete `component-graph.ts`
- delete `component-graph-executor.ts`
- delete `marker-graph-resolver.ts`
- remove marker parsing and marker DAG execution from `integration-renderer.ts`
- remove the marker-resolution pass loop from `render-execution.service.ts`
- simplify `component-render-context.ts` so it no longer captures deferred boundary props for graph reconstruction

### Rebuild tests around output contracts, not marker internals

Keep testing:

- final route HTML
- nested output ordering
- root attributes
- asset bubbling
- explicit `renderToResponse()` behavior

Avoid locking in the marker mechanism if the goal is to delete it.

## Re-evaluated Conclusion

After reviewing the live orchestration again, the right simplification is not:

- a better marker graph
- a faster marker graph
- a more generic deferred boundary abstraction

The right simplification is to invert control.

Core should stop reconstructing nested mixed-integration trees after render.
The owning renderer should resolve its own subtree, and core should only provide:

- route entry and page-data preparation
- dependency collection and final HTML transformation
- renderer lookup and a small nested-boundary dispatch contract

That is the main difference between the current architecture and the simpler one.

Today, core owns:

- boundary deferral policy execution
- marker emission format
- props and slot capture
- graph extraction
- bottom-up execution ordering
- nested renderer dispatch during graph resolution

That is too much shared orchestration for what should be renderer-owned composition.

## Astro Comparison Revisited

The Astro comparison is still useful, but it points in a narrower direction than the earlier work assumed.

What Astro suggests:

- composition should happen at the boundary layer that owns the page template
- framework integrations should render isolated framework-owned islands
- delayed rendering should stay isolated to the owning implementation, not leak into a shared generic DAG

What Astro does not justify here:

- a generic cross-framework bottom-up graph executor in shared core
- reconstructing parent-child relationships from emitted HTML markers as the default nested rendering model

Ecopages is not Astro, because Ecopages allows mixed integration nesting through shared component authoring APIs instead of only through a dedicated template language. That means some shared boundary dispatch is still needed. But Astro still points toward a smaller design:

- shared dispatch
- renderer-owned subtree resolution
- no generic graph reconstruction stage in core

## Proper Simplified Target Model

The proper target is a renderer-owned recursive boundary model.

### Core responsibilities

Core should own only these rendering concerns:

- choose the route renderer
- load page module, props, metadata, and route assets
- expose a renderer registry / nested-boundary resolver
- preserve streaming route output when no HTML rewrite is required
- collect emitted assets
- apply final HTML transformation and document-level attributes

Core should not own these concerns anymore:

- marker HTML syntax
- marker parsing
- propsRef or slotRef registries
- graph extraction from HTML
- graph levels and bottom-up graph execution
- repeated marker-resolution passes over the full route HTML

### Renderer responsibilities

Each renderer should own how it resolves nested foreign components inside its own render lane.

Each renderer should also keep control over whether a top-level view or route body is produced as:

- a stream
- a fully materialized string

That choice should remain integration-owned, with the orchestrator deciding whether the chosen body can be preserved or must be materialized for a required rewrite step.

For string-oriented renderers such as Lit, Kita, and Ecopages JSX, the simple model is:

1. render local content normally
2. when a foreign component boundary is encountered, immediately dispatch to the owning renderer
3. receive final HTML plus assets for that subtree
4. insert that HTML directly into the parent renderer output

That is a normal recursive render model. No graph reconstruction is required.

### Streams versus strings

This deserves an explicit note because simplification should not accidentally regress the current rendering contract.

At the route or explicit-view level, components can legitimately be rendered as either streams or strings.

The right ownership split is:

- the integration renderer chooses the most natural body shape for the current render path
- the orchestrator decides whether that body can pass through unchanged or whether it must be normalized to a string for post-processing

Examples of when preserving a stream is valid:

- a partial `renderToResponse()` path that does not need final HTML rewriting
- a route render that does not need marker resolution, root-attribute stamping, or document-level mutation

Examples of when materializing to a string is still valid:

- dependency injection or HTML transformation that requires full-document inspection
- renderer-local placeholder replacement
- attribute stamping on the rendered root or document element

The important rule is not `always stream` or `always stringify`.

The important rule is:

- integrations own how they render
- orchestrators own whether a later stage requires materialized HTML

Nested boundary rendering is a separate concern.

For nested subtree composition, the boundary contract should still return final HTML strings plus assets, because parent renderers need an insertable fragment. That does not conflict with top-level route rendering remaining stream-capable.

### React as the explicit exception

React is the hard case because React cannot naturally await and inline arbitrary foreign renderer output during `renderToString()` in the same way string renderers can.

That does not mean the shared marker graph should survive everywhere.

It means React should own a small React-specific deferred boundary mechanism.

The simplified target is:

- string renderers use immediate recursive boundary resolution
- React uses a renderer-local placeholder queue for foreign boundaries
- that queue resolves after React SSR, inside the React renderer, not in shared core

This keeps the hard case explicit and prevents React from forcing graph orchestration onto every renderer.

## Proposed Contract Change

The current core contract is effectively:

- decide whether to defer
- emit marker
- capture props and slot links
- rebuild tree later

The replacement contract should be closer to:

```ts
type NestedBoundaryRenderRequest = {
	component: EcoComponent;
	props: Record<string, unknown>;
	renderedChildrenHtml?: string;
	targetIntegration: string;
	parentIntegration: string;
	componentInstanceId?: string;
};

type NestedBoundaryRenderResult = {
	html: string;
	assets?: ProcessedAsset[];
	rootAttributes?: Record<string, string>;
	canAttachAttributes?: boolean;
};

interface NestedBoundaryResolver {
	renderBoundary(input: NestedBoundaryRenderRequest): Promise<NestedBoundaryRenderResult>;
}
```

That contract is small enough to understand and does not require core to know how a renderer internally stages its own subtree work.

The important detail is that `renderedChildrenHtml` must already be parent-owned serialized HTML.

That keeps slot ownership explicit:

- the parent renderer is responsible for rendering its own child slot content
- the foreign child renderer receives insertable HTML, not framework-native child nodes from another renderer
- recursive mixed nesting is handled by resolving children first, then passing their HTML into the next boundary call

This contract is intentionally for nested boundaries, not for top-level route bodies.

Top-level `render()` and `renderToResponse()` should remain free to return either a stream or a string. The simplification target is to reduce graph orchestration, not to collapse the rendering surface into one body type.

The main inversion is:

- core dispatches renderer ownership
- renderers decide how to complete their subtree
- only the owning renderer decides whether it needs local placeholder staging

## Required Runtime Change

The current interception point is too small and too synchronous for the target model.

Today the live contract is effectively:

- `eco.component()` asks `decideBoundaryRender()` for `inline` or `defer`
- `tryRenderDeferredBoundary()` either returns an `eco-marker` string immediately or does nothing
- `runWithComponentRenderContext()` captures marker refs, not resolved nested HTML

That means the current hook cannot simply receive a resolver and keep the same shape.

If the plan wants immediate recursive foreign-boundary resolution, the render-context interception point itself has to change.

The minimal replacement should be:

```ts
type BoundaryInterceptionResult =
	| { kind: 'inline' }
	| { kind: 'resolved'; result: NestedBoundaryRenderResult }
	| { kind: 'placeholder'; html: string };

interface ComponentBoundaryRuntime {
	interceptBoundary(input: NestedBoundaryRenderRequest): Promise<BoundaryInterceptionResult>;
}
```

This is not meant to be additive machinery next to markers.

It is the replacement for:

- `BoundaryRenderMode`
- `ComponentRenderBoundaryContext`
- synchronous `tryRenderDeferredBoundary()` marker emission

The intended behavior is:

1. same-integration boundary returns `{ kind: 'inline' }`
2. async-capable string renderer returns `{ kind: 'resolved', result }`
3. React returns `{ kind: 'placeholder', html }` for its renderer-local deferred lane

This is the smallest shared contract that matches the actual runtime need.

Without this change, the phrase "resolve immediately during render" is not implementable because the current render-context hook can only emit a synchronous placeholder.

### Render-context consequences

This implies a few concrete runtime changes:

- `eco.component()` or its server-render helper must become async-aware at the boundary interception point
- `runWithComponentRenderContext()` must carry a boundary runtime, not only a defer-policy facade
- the shared context should stop allocating `nodeId`, `propsRef`, and `slotRef` counters once marker capture is no longer needed for a renderer lane

The design goal is still deletion-first.

The runtime should not gain a second generic orchestration system.
It should replace the current defer-or-marker branch with a single interception contract that either:

- lets the current renderer continue inline
- returns resolved subtree HTML
- returns a renderer-local placeholder for the explicit hard case

## Concrete Architecture Direction

### 1. Replace boundary policy with boundary resolution

Today `ComponentRenderBoundaryContext` decides whether a boundary should emit a marker.

The simpler direction is for the render context to expose a boundary resolver instead:

- same-integration boundary: render inline
- foreign boundary in an async-capable string renderer: resolve immediately through nested renderer dispatch
- foreign boundary in React: record a React-local deferred boundary placeholder

That removes the generic defer-or-inline branch from shared core orchestration.

The important implementation detail is that renderer lookup has to be available inside the active render context.

Today renderer lookup happens later, during marker resolution.
In the simplified model, core should construct a single `NestedBoundaryResolver` per route or explicit render execution and inject it into the component render context before the parent renderer starts rendering.

### 2. Move nested resolution inside the renderer lane

For Lit and Ecopages JSX, mixed nesting should be resolved while rendering the parent subtree, not after the full route HTML already exists.

That means:

- remove `capture + finalize` as the normal path for mixed nesting in these renderers
- keep asset bubbling and root-attribute application as renderer return values
- let the parent renderer receive already-final HTML for each nested foreign subtree

This still allows a top-level renderer to stream when no later rewrite is required. The recursive nested-boundary contract only requires string fragments at subtree boundaries, not a fully stringified route pipeline.

Children must be resolved in parent order.

That means the parent renderer renders slot content first, obtains serialized child HTML, and only then calls the nested-boundary resolver for the foreign child component.
This preserves the same ownership model the marker system currently reconstructs indirectly through `propsRef` and `slotRef`, but without rebuilding the tree from emitted HTML.

### 2a. Treat Kita as a separate feasibility checkpoint

Kita should not be assumed to fit the same first-wave implementation as Lit and Ecopages JSX until its component rendering lane is proven async-capable at the foreign-boundary interception point.

The design should therefore distinguish two cases:

- Lit and Ecopages JSX are the first async-capable candidates for direct recursive boundary resolution
- Kita either adopts the same async interception model after validation or temporarily keeps a renderer-local placeholder step

That is still compatible with the simplification goal.

What should be avoided is keeping the shared marker graph alive just because one non-React renderer needs a temporary compatibility lane.

### 3. Localize React deferred handling

React should get a renderer-private mechanism roughly like this:

1. foreign boundaries inside React emit React-local placeholder tokens
2. React renderer stores boundary requests keyed by token
3. after `renderToString()` or equivalent completes, React renderer resolves those tokens recursively through the nested-boundary resolver
4. React renderer returns final HTML plus bubbled assets

Important: this is not the current shared graph model with new names.

It is intentionally smaller because:

- it is scoped to React only
- it does not parse the final route HTML into a generic DAG
- it does not require shared propsRef and slotRef registries
- it only resolves the placeholders that React itself emitted for its own subtree

### 4. Remove page-module graph exports from the main model

`componentGraphContext` should stop being part of the default nested rendering story.

If a renderer genuinely needs explicit metadata for its own local deferred lane, that metadata should be renderer-specific and not part of shared core route orchestration.

This is important because `componentGraphContext` is currently a real public contract, not just an incidental internal leak.

That means it should be removed only after the replacement path exists and page modules no longer need to supply graph metadata.

Today it carries marker mechanics into:

- page module loading
- render preparation
- render execution
- public types

That leak is one of the biggest sources of cognitive load.

## File-by-file Implementation Map

This section is the concrete migration map for the first implementation pass.

The point is to make the change sequence explicit enough that work can start without re-deriving the architecture from scratch.

### Core files to change first

#### `packages/core/src/route-renderer/orchestration/component-render-context.ts`

Primary role in the migration:

- replace sync defer-policy interception with async boundary interception
- stop making marker capture the default render-context responsibility

Expected changes:

- remove `BoundaryRenderMode`
- remove `BoundaryRenderDecisionInput`
- remove `ComponentRenderBoundaryContext`
- replace `DeferredBoundaryRenderInput` with `NestedBoundaryRenderRequest` or an equivalent internal shape
- replace `tryRenderDeferredBoundary()` with an async interception method that can return inline, resolved, or placeholder results
- split marker-specific capture behavior behind a renderer-local compatibility runtime instead of the default shared runtime
- stop allocating `nextNodeId`, `nextPropsRefId`, and `nextSlotRefId` for migrated renderer lanes

Result after Phase 1:

- this file still owns render-context scoping
- it no longer defines the main shared marker emission contract
- React compatibility logic may still use a private placeholder collector, but not the shared graph format

#### `packages/core/src/route-renderer/orchestration/integration-renderer.ts`

Primary role in the migration:

- construct and inject the nested-boundary runtime for one render execution
- stop owning shared marker-graph execution for migrated renderers

Expected changes:

- replace `getComponentRenderBoundaryContext()` with something like `createComponentBoundaryRuntime()` or `createNestedBoundaryResolver()`
- keep renderer lookup in this file, but move it behind a small resolver contract that can be injected into render context before render starts
- make the route execution path choose between:
    - migrated renderer lane with direct boundary interception
    - temporary compatibility lane for React and any non-migrated renderer
- shrink or remove `resolveMarkerGraphHtml()` usage from the default path
- shrink or remove `renderComponentForMarkerGraph()` from the default path

Result after Phase 1:

- renderer lookup still lives here
- marker parsing and marker DAG execution no longer define the default mixed-rendering path

#### `packages/core/src/route-renderer/orchestration/render-execution.service.ts`

Primary role in the migration:

- stop assuming every route render must support generic marker finalization
- preserve non-marker HTML finalization steps

Expected changes:

- split the current finalization responsibilities into:
    - route-body capture and optional materialization
    - non-marker HTML finalization such as root-attribute stamping and document-attribute stamping
    - temporary marker compatibility finalization for non-migrated renderers only
- remove the repeated marker-resolution loop from the migrated path
- keep the stream-preserving fast path intact

Result after Phase 1:

- this file still owns materialization and final response shaping
- it no longer owns generic bottom-up graph resolution for migrated renderer lanes

#### `packages/core/src/route-renderer/orchestration/render-preparation.service.ts`

Primary role in the migration:

- stop requiring page-root render preparation to use marker capture as its default contract

Expected changes:

- replace `getComponentRenderBoundaryContext()` callback usage with the new boundary runtime callback
- make `renderPageRoot()` run under the new runtime contract
- keep `componentRender` capture for page-root attributes and asset collection
- keep `componentGraphContext` only as a temporary explicit compatibility input until the fallback lane is removed

Result after Phase 1:

- page-root preparation remains
- marker-specific graph capture is no longer the default preparation model

#### `packages/core/src/route-renderer/page-loading/page-module-loader.ts`

Primary role in the migration:

- keep explicit `componentGraphContext` loading only as a temporary compatibility contract

Expected changes:

- no major first-pass runtime rewrite required
- document this file as transitional and remove `componentGraphContext` loading only after the compatibility lane is gone

#### `packages/core/src/types/public-types.ts`

Primary role in the migration:

- express the new nested-boundary contract in public or semi-public types
- move `ComponentGraphContext` toward deprecation and later removal

Expected changes:

- add `NestedBoundaryRenderRequest`
- add `NestedBoundaryRenderResult`
- optionally add `BoundaryInterceptionResult` if the interception contract remains shared at the type layer
- keep `RouteRendererBody` unchanged
- keep `ComponentGraphContext` temporarily, but mark it as compatibility-only in the plan and implementation comments where needed

### Integration files for the first pass

#### `packages/integrations/lit/src/lit-renderer.ts`

Primary role in the migration:

- become the first full migrated string renderer

Expected changes:

- stop using `captureHtmlRender()` plus `finalizeCapturedHtmlRender()` for mixed nested rendering
- resolve foreign boundaries during render via the injected boundary runtime
- keep `renderValueToString()` as the async leaf serializer used before foreign dispatch
- continue returning assets and root-tag metadata through `renderComponent()`

Why Lit first:

- async SSR lane already exists
- child HTML serialization already exists
- current mixed shell handling is explicit and understandable

#### `packages/integrations/ecopages-jsx/src/ecopages-jsx-renderer.ts`

Primary role in the migration:

- become the second migrated string renderer using the same boundary runtime pattern as Lit

Expected changes:

- stop using route-level marker finalization for nested mixed rendering
- use JSX render helpers to resolve parent-owned child content first, then dispatch foreign boundaries
- keep asset-frame collection behavior unchanged except for removal of marker-specific staging

#### `packages/integrations/kitajs/src/kitajs-renderer.ts`

Primary role in the migration:

- act as the explicit feasibility checkpoint

Expected changes in the best case:

- adopt the same async boundary interception contract as Lit and Ecopages JSX

Expected changes in the fallback case:

- keep a tiny renderer-local placeholder step temporarily
- do not block shared graph deletion for migrated route lanes

#### `packages/integrations/react/src/react-renderer.ts`

Primary role in the migration:

- become the only renderer that still performs deferred subtree staging after Phase 1

Expected changes:

- add a private placeholder registry keyed by token
- collect boundary requests during React render
- resolve tokens after `renderToString()` or equivalent completes
- keep the existing React-specific child HTML insertion pattern, but stop depending on shared graph files once Phase 2 lands

### Test files to update with the first pass

#### `packages/core/src/route-renderer/orchestration/integration-renderer.test.ts`

- keep output-contract coverage
- add migration-path coverage for one fully migrated string renderer
- avoid asserting marker internals on the new path

#### `packages/core/src/route-renderer/orchestration/render-execution.service.test.ts`

- split tests between generic response finalization and any temporary compatibility path
- remove assumptions that finalization always means marker resolution

#### e2e coverage

- keep mixed-integration ordering checks
- keep no-marker-artifact checks in final HTML
- ensure at least one Lit-foreign-child and one Ecopages-JSX-foreign-child route is covered before graph deletion

## Exact Core Contract Changes

This is the type-and-API level design for the first implementation pass.

The goal is to make the first code diff narrow and explicit.

### `component-render-context.ts`

Current shared contract:

```ts
export type BoundaryRenderMode = 'inline' | 'defer';

export type BoundaryRenderDecisionInput = {
	currentIntegration: string;
	targetIntegration?: string;
	component: EcoComponent;
};

export type ComponentRenderBoundaryContext = {
	decideBoundaryRender(input: BoundaryRenderDecisionInput): BoundaryRenderMode;
};

export function tryRenderDeferredBoundary<E>(input: DeferredBoundaryRenderInput): E | undefined;
```

Target shared contract:

```ts
export type NestedBoundaryRenderRequest = {
	component: EcoComponent;
	props: Record<string, unknown>;
	renderedChildrenHtml?: string;
	targetIntegration: string;
	parentIntegration: string;
	componentInstanceId?: string;
};

export type NestedBoundaryRenderResult = {
	html: string;
	assets?: ProcessedAsset[];
	rootAttributes?: Record<string, string>;
	canAttachAttributes?: boolean;
};

export type BoundaryInterceptionResult =
	| { kind: 'inline' }
	| { kind: 'resolved'; result: NestedBoundaryRenderResult }
	| { kind: 'placeholder'; html: string };

export interface ComponentBoundaryRuntime {
	interceptBoundary(input: NestedBoundaryRenderRequest): Promise<BoundaryInterceptionResult>;
}
```

Context shape change:

```ts
type ComponentRenderContext = {
	currentIntegration: string;
	boundaryRuntime: ComponentBoundaryRuntime;
	finalizeComponentRender<T>(component: EcoComponent, content: T): T;
	interceptBoundary(input: NestedBoundaryRenderRequest): Promise<BoundaryInterceptionResult>;
	compatibilityGraphContext?: ComponentGraphContext;
	serializeDeferredValue?: DeferredValueSerializer;
};
```

Important notes:

- `compatibilityGraphContext` is temporary and should only exist while React or any fallback lane still depends on graph-like staging
- the default shared context should no longer expose marker counters once migrated renderers stop using them
- the main export should become an async boundary helper instead of sync `tryRenderDeferredBoundary()`

Practical helper shape for the first pass:

```ts
export async function interceptComponentBoundary(
	input: NestedBoundaryRenderRequest,
): Promise<BoundaryInterceptionResult>;
```

That helper can replace the current marker-oriented helper one callsite at a time.

### `integration-renderer.ts`

Current shared orchestration surface:

- `getComponentRenderBoundaryContext()`
- `shouldDeferComponentBoundary()`
- `captureHtmlRender()`
- `finalizeCapturedHtmlRender()`
- `resolveMarkerGraphHtml()`
- `renderComponentForMarkerGraph()`

Target orchestration surface:

- `createNestedBoundaryResolver()`
- `createComponentBoundaryRuntime()`
- `renderNestedBoundary()`
- `finalizeResolvedHtml()`
- temporary compatibility hook for non-migrated renderers only

Suggested concrete signatures:

```ts
protected createNestedBoundaryResolver(
	cache: Map<string, IntegrationRenderer<any>>,
): NestedBoundaryResolver;

protected createComponentBoundaryRuntime(options: {
	resolver: NestedBoundaryResolver;
	compatibilityMode?: 'none' | 'react-local' | 'legacy-graph';
}): ComponentBoundaryRuntime;

protected async finalizeResolvedHtml(options: {
	html: string;
	partial?: boolean;
	componentRootAttributes?: Record<string, string>;
	documentAttributes?: Record<string, string>;
	mergeAssets?: boolean;
	transformHtml?: boolean;
}): Promise<string>;
```

Migration intent of each method:

- `createNestedBoundaryResolver()`: owns renderer lookup and cross-renderer dispatch
- `createComponentBoundaryRuntime()`: decides inline vs resolved vs placeholder for the active renderer lane
- `finalizeResolvedHtml()`: keeps non-marker finalization logic after marker-loop removal

Methods that should become compatibility-only during migration:

- `resolveMarkerGraphHtml()`
- `renderComponentForMarkerGraph()`
- `captureHtmlRender()`
- `finalizeCapturedHtmlRender()`

They do not all need to be deleted in the first pass, but they should stop being the primary path.

### `render-preparation.service.ts`

Current callback surface includes:

```ts
getComponentRenderBoundaryContext(): ComponentRenderBoundaryContext;
```

Target callback surface should be closer to:

```ts
createComponentBoundaryRuntime(): ComponentBoundaryRuntime;
```

The point is that page-root rendering during preparation should run under the same interception contract as normal nested rendering.

This avoids introducing a special preparation-only boundary policy that would drift away from route execution.

### `render-execution.service.ts`

Current responsibility bundle:

- capture render output
- materialize body when needed
- loop over markers until stable
- stamp component and document attributes
- run HTML transformation

Target responsibility bundle:

- capture render output
- materialize body only when needed
- run optional temporary compatibility finalization for non-migrated lanes
- stamp component and document attributes
- run HTML transformation

That means marker looping must stop being the default meaning of "finalization."

### Start order for the first code pass

If implementation starts immediately after this plan, the most defensible order is:

1. change shared core types in `component-render-context.ts` and `public-types.ts`
2. add the injected boundary runtime and resolver creation in `integration-renderer.ts`
3. adapt `render-preparation.service.ts` and `render-execution.service.ts` to the new runtime surface while keeping a temporary compatibility lane
4. migrate Lit end-to-end
5. migrate Ecopages JSX using the same pattern
6. decide whether Kita joins the same pass or stays on a temporary compatibility lane
7. only then start deleting shared graph files

## Recommended Phasing

This should be executed as a deletion-first staged migration.

### Phase 1: Introduce boundary interception and migrate async-capable string renderers

Goal:

- replace the sync defer-or-marker hook with async boundary interception
- make Lit and Ecopages JSX resolve foreign boundaries recursively without marker graph staging

Expected deletions or heavy shrinkage:

- replace `ComponentRenderBoundaryContext` and sync marker interception with an injected `NestedBoundaryResolver` or equivalent boundary runtime
- remove `resolveMarkerGraphHtml()` and related graph dispatch from `integration-renderer.ts` for migrated renderer lanes
- remove marker capture responsibilities from `component-render-context.ts` for migrated renderer lanes
- stop routing migrated `renderToResponse()` paths and nested component resolution through `captureHtmlRender()` plus `finalizeCapturedHtmlRender()`
- keep non-marker final HTML mutation steps such as root-attribute and document-attribute application

Expected behavior preservation:

- integrations can still choose stream or string bodies for top-level route and explicit-view rendering
- the orchestrator only materializes when a later mutation stage actually requires it

Expected temporary compromise:

- Kita may require a separate checkpoint before joining the recursive path
- React may still keep a renderer-local deferred placeholder lane

This phase should already count as real simplification if the shared graph subsystem is no longer the default mixed-rendering model.

### Phase 1a: Lit and Ecopages JSX

These renderers already have async server render lanes and are the best first candidates for recursive foreign-boundary dispatch.

The concrete target is:

- inject the nested-boundary runtime into their active render context
- let foreign boundaries return resolved HTML fragments plus assets during render
- remove their dependency on route-level marker finalization for mixed nesting

### Phase 1b: Kita feasibility decision

Before migrating Kita, answer one concrete question:

- can the Kita server component path suspend on foreign boundary interception without reintroducing a second shared orchestration pass?

If yes, migrate Kita to the same boundary runtime.

If no, keep Kita on a small renderer-local compatibility lane temporarily and continue deleting the shared graph from the route-level default path.

### Phase 2: Isolate React deferred rendering behind a private renderer contract

Goal:

- ensure React is the only place where deferred subtree staging still exists

Expected changes:

- add a React-local boundary queue or placeholder resolver
- move any remaining nested foreign-boundary ordering logic into `react-renderer.ts`
- remove the need for shared graph files from core entirely

At the end of this phase, these files should be deletable from core:

- `packages/core/src/route-renderer/component-graph/component-marker.ts`
- `packages/core/src/route-renderer/component-graph/component-graph.ts`
- `packages/core/src/route-renderer/component-graph/component-graph-executor.ts`
- `packages/core/src/route-renderer/component-graph/marker-graph-resolver.ts`

### Phase 3: Collapse page-root pre-render if possible

This is separate from marker deletion, but it is part of the broader simplification opportunity.

Today the page root may be rendered once in preparation to collect component artifacts and then rendered again for the full route body.

The cleaner target is for full route rendering to return a structured result such as:

- body
- page-root attributes
- document attributes
- emitted assets

If that contract is adopted, `render-preparation.service.ts` no longer needs page-root render capture as a separate orchestration concept.

This is likely the next major cognition win after graph deletion.

## What To Delete First

If the next implementation pass needs a strict order, delete in this order:

1. route-level repeated marker-resolution passes
2. shared marker graph extraction and execution
3. shared marker capture from component render context
4. page-module `componentGraphContext` as a default shared contract
5. any remaining renderer fast paths that only exist to avoid the shared marker system

That order matters because it removes the shared architecture before chasing local cleanup.

## What Not To Do Again

The next pass should avoid these moves:

- do not add a new generic deferred-boundary abstraction in core
- do not keep the graph and add a second optimized path next to it
- do not solve React by preserving the same shared mechanism for every renderer
- do not count renderer-local bypasses as architecture deletion if the shared graph still controls route rendering
- do not expand output-contract tests into marker-mechanism tests

## Acceptance Criteria For A Successful Restart

The work should only be considered successful if most of the following become true:

- the main route execution path no longer parses `eco-marker` HTML in shared core
- nested mixed-integration rendering for Lit, Kita, and Ecopages JSX resolves recursively inside renderer-owned code
- React-specific deferred handling, if still needed, is local to the React renderer
- `componentGraphContext` is removed or no longer part of the default cross-renderer path
- the explicit component-graph subsystem is deleted from core
- the route-renderer mental model can be explained without graph extraction, topological levels, props refs, or slot refs

## Practical Next Implementation Target

If the goal is to make real progress in the next coding pass, the most defensible target is:

1. introduce the small nested-boundary resolver contract
2. refactor one string renderer end-to-end to use recursive boundary resolution with no marker finalization
3. generalize that pattern to the other string renderers
4. keep React working behind a temporary renderer-local deferred implementation
5. delete the shared graph subsystem from core once React no longer depends on it

That path is more honest than trying to delete everything in one blind jump, but it still targets large shared deletion instead of local patching.

## Main Risk

React is the blocker that most likely determines whether full marker deletion is possible in one step.

The reason is not only hydration assets. It is that the current shared marker model solves nested foreign-boundary ordering and child reinsertion in a generic way that React does not naturally share with the string-oriented renderers.

So the next serious pass should treat React as one of these explicit decisions:

- either give React a dedicated recursive boundary model
- or temporarily preserve a React-specific fallback while deleting the shared generic graph system for the other renderers

But the branch should stop pretending that small renderer cleanups equal architectural simplification.

## Recommended Restart Rule

Use this rule for the next attempt:

> A change only counts as simplification if it deletes a live shared concept or removes a required stage from the main rendering model.

By that rule:

- deleting dead branches counts
- deleting duplicate renderer setup counts
- removing `capture + graph + finalize` from one live path counts
- adding a second generic way to do the same thing does not count

## Files Changed So Far In This Branch

Relevant current branch edits include:

- `packages/core/src/route-renderer/orchestration/integration-renderer.test.ts`
- `packages/integrations/kitajs/src/kitajs-renderer.ts`
- `packages/integrations/lit/src/lit-renderer.ts`
- `packages/integrations/ecopages-jsx/src/ecopages-jsx-renderer.ts`
- `packages/integrations/ecopages-jsx/src/test/ecopages-jsx-renderer.test.tsx`
- `packages/core/CHANGELOG.md`

These should be treated as current branch context, not proof that the original goal has been met.

## Bottom Line

The user request was:

- remove the graph
- remove the marker approach
- keep functionality
- reduce architecture and cognition debt in a large, visible way

That has not happened yet.

What happened so far is:

- some useful test coverage was added
- some renderer-owned explicit paths were simplified
- one wrong generic abstraction was added and later removed

The next pass should start from the premise that the real target is deletion of the shared marker graph model itself.
