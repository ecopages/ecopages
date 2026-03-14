# RFC: Layout, HTML Shell, and Route Composition

## Summary

This RFC proposes making Ecopages render concepts explicit without changing the overall route model.

The long-term public model should be:

- `eco.html` owns document scope
- `eco.layout` owns route-shell scope
- `eco.page` owns route-content scope

The framework should discover shell artifacts by semantic basename such as `html` and `404`, resolve them by registered integration extension, and stop centering the public API around configured template filenames.

## Status

Proposed.

## Motivation

Ecopages already has distinct render layers in practice:

- a document shell
- a route shell
- a route content component

However, the public model does not communicate that clearly.

Today:

- the HTML shell exists, but is surfaced through config-driven include filenames
- layout exists, but is expressed as a generic component attached to `eco.page`
- `head` and `seo` are treated as if they are framework-level rendering primitives
- explicit routes and filesystem routes share the same renderer, but the public API does not highlight the common model

This creates avoidable confusion in three places:

1. Ownership: users are not given a clean mental model for document shell vs route shell vs page content.
2. Discoverability: users must learn filename config instead of framework concepts.
3. Extensibility: future work on typed layouts, shell selection, or discovery conventions has no strong semantic boundary.

The goal of this RFC is to align the public model with the architecture Ecopages already has.

## Non-Goals

This RFC does not propose:

- replacing `pages/` with an app-router directory model
- making filesystem layout inheritance the primary abstraction
- collapsing document shell and route shell into one concept
- keeping `seo` or `head` as first-class global template concepts
- requiring immediate breaking changes to existing apps
- making layout-selected HTML override part of the first implementation milestone

## Current State

### Existing render flow

The current renderer already follows this structure:

1. Resolve the app HTML template.
2. Render the page.
3. Optionally wrap the page in a layout.
4. Pass the result into the HTML template.

This is visible in:

- `HtmlTemplateProps` in [packages/core/src/public-types.ts](/Users/andeeplus/github/ecopages/packages/core/src/public-types.ts)
- render preparation in [packages/core/src/route-renderer/render-preparation.service.ts](/Users/andeeplus/github/ecopages/packages/core/src/route-renderer/render-preparation.service.ts)
- HTML template loading in [packages/core/src/route-renderer/integration-renderer.ts](/Users/andeeplus/github/ecopages/packages/core/src/route-renderer/integration-renderer.ts)
- concrete renderer behavior in [packages/core/src/integrations/ghtml/ghtml-renderer.ts](/Users/andeeplus/github/ecopages/packages/core/src/integrations/ghtml/ghtml-renderer.ts)
- concrete renderer behavior in [packages/integrations/kitajs/src/kitajs-renderer.ts](/Users/andeeplus/github/ecopages/packages/integrations/kitajs/src/kitajs-renderer.ts)
- concrete renderer behavior in [packages/integrations/react/src/react-renderer.ts](/Users/andeeplus/github/ecopages/packages/integrations/react/src/react-renderer.ts)

### Existing config surface

The current config still treats semantic render files as configured filenames, including:

- `includesTemplates.html`
- `includesTemplates.head`
- `includesTemplates.seo`
- `error404Template`

This configuration lives in:

- [packages/core/src/internal-types.ts](/Users/andeeplus/github/ecopages/packages/core/src/internal-types.ts)
- [packages/core/src/config/config-builder.ts](/Users/andeeplus/github/ecopages/packages/core/src/config/config-builder.ts)

### Existing locals contract

`locals` is already a real render concept.

Today:

- pages receive `pageLocals`
- layouts receive `locals`
- static pages are protected by a proxy when request locals are not available

This is visible in:

- [packages/core/src/route-renderer/render-preparation.service.ts](/Users/andeeplus/github/ecopages/packages/core/src/route-renderer/render-preparation.service.ts)
- [packages/core/src/public-types.ts](/Users/andeeplus/github/ecopages/packages/core/src/public-types.ts)
- [packages/integrations/react/README.md](/Users/andeeplus/github/ecopages/packages/integrations/react/README.md)

### Current conceptual mismatch

The runtime is already layered, but the public API is not.

That mismatch is the core problem this RFC addresses.

## Problem Statement

Ecopages needs a clearer separation between:

1. Document shell: `<html>`, `<head>`, `<body>`, root attributes, metadata composition, hydration payload insertion.
2. Route shell: shared per-section or per-page wrappers such as nav, header, footer, router context, layout-local dependencies, request locals.
3. Route content: the page itself.

The framework should expose these as first-class concepts rather than as a mixture of config-driven filenames and generic component reuse.

## Public Concepts

### `eco.html`

`eco.html` is the app document shell.

Responsibilities:

- render `<html>`
- render `<head>`
- render `<body>`
- apply document-level attributes
- compose metadata in document scope
- own document-level scripts and styles
- receive route payload data needed by the shell

Initial public shape:

```ts
export default eco.html({
	render: ({ children, metadata, language, pageProps }) => {
		// document shell
	},
});
```

This can compile to the existing HTML template mechanism internally.

Long-term type direction:

- replace head-centric naming with an HTML-centric public type
- fold the current `PageHeadProps` surface into the HTML shell props
- keep the public API centered on one document-shell contract rather than a separate head contract

### `eco.layout`

`eco.layout` is the route shell.

Responsibilities:

- wrap page content
- provide route or section chrome
- own layout-local dependencies
- receive request `locals` when available
- optionally host router-aware layout behavior when integrations require it

Initial public shape:

```ts
export const MainLayout = eco.layout({
	render: ({ children, locals }) => {
		// route shell
	},
});
```

Long-term design intent:

- `eco.layout` is a real semantic boundary, not just a cosmetic alias over `eco.component`
- the public contract should be strong enough to carry route-shell concerns cleanly over time
- layout is the correct selection point for a future HTML-shell override

Illustrative future direction:

```ts
export const DashboardLayout = eco.layout({
	html: DashboardHtml,
	render: ({ children, locals }) => {
		// dashboard route shell
	},
});
```

That override should not be implemented in the first milestone, but the long-term model should be designed around it.

### `eco.page`

`eco.page` remains the route content API.

Responsibilities:

- route content
- metadata
- static props and static paths
- cache and middleware
- route-level layout selection

## Public Mental Model

The intended model becomes:

- `eco.html` owns document scope
- `eco.layout` owns route-shell scope
- `eco.page` owns route-content scope

This matches the current runtime while making the design easier to understand.

## Layout Depth Model

This RFC does not recommend framework-managed nested layout inheritance as a core feature.

### Recommended model

- one declared layout per page
- layouts can compose other components or layouts manually in userland
- no filesystem-driven layout inheritance is required for the core design

Reason:

- this keeps the mental model small
- it avoids precedence and inheritance complexity
- it works equally well for filesystem routes and explicit routes
- it preserves flexibility because users can still compose shells manually when they need deeper structure

Nested layouts may still exist as userland composition, but they should not define the framework contract.

## HTML Shell Selection

### Long-term model

The long-term model should allow one effective HTML shell per route.

Conceptually:

- pages select layout
- layout may later select HTML shell
- the renderer resolves one effective HTML shell for the route

Important constraints:

- HTML shells are selected, not nested
- HTML shells are alternative document roots, not wrappers around each other
- the effective result is still one document shell per rendered route

### Recommendation for scope

Do not implement layout-selected HTML override in the first milestone.

But design `eco.layout` for that long-term direction now, so the public contract does not need to be rethought later.

## File Ownership

### `pages/`

`pages/` remains route space.

It should contain:

- route pages
- `404.*` as the route fallback artifact

It should not contain:

- `html.*`

Reason:
`html.*` is not a route artifact. Putting it in `pages/` would weaken route semantics and require special-case scanner behavior in code such as [packages/core/src/router/fs-router-scanner.ts](/Users/andeeplus/github/ecopages/packages/core/src/router/fs-router-scanner.ts).

### Document shell location

Long term, the preferred home should be:

- `src/html.*`

`src/includes/html.*` should be treated as a transition location only.

## Discovery Rules

### Principle

Discover by semantic basename. Render by extension.

The framework should:

1. discover semantic artifacts such as `html` and `404` by basename
2. resolve the matched file by registered integration extensions
3. render using the integration associated with the resolved extension

This aligns discovery with framework concepts instead of config-defined filenames.

### HTML shell discovery

Long-term rule set:

1. Look for `src/html` with any registered integration extension.
2. If not found, use the built-in framework default HTML shell.

### 404 discovery

Long-term rule set:

1. Look for `src/pages/404` with any registered integration extension.
2. If not found, use the built-in framework default 404 page.

### Duplicate semantic matches

If multiple files match the same semantic artifact, such as multiple `html.*` files or multiple `404.*` files, the framework should treat that as configuration ambiguity and fail with a clear error.

Examples:

- `src/html.ghtml.ts` and `src/html.kita.tsx`
- `src/pages/404.ghtml.ts` and `src/pages/404.kita.tsx`

Reason:

- one semantic artifact should resolve to one source of truth
- ambiguity at document-shell or fallback level is better surfaced as an explicit configuration error than silently tolerated

### Why semantic basename discovery

This is better than exact configured filenames because:

- the framework already knows registered integration extensions
- users should not need to restate those extensions in app config
- conventions improve discoverability and starter simplicity
- HTML shell and 404 can follow one coherent policy

## Config Changes

### Removal

Remove these as primary user-facing APIs:

- `setIncludesTemplates()`
- `setError404Template()`

### Remove from first-class config model

These should no longer be treated as first-class configured template concepts:

- `head`
- `seo`

Reason:

These are not environment configuration concerns. They are composition concerns and should be represented by API and convention instead.

### What config should still own

Config should keep owning system and environment concerns such as:

- root directories
- integrations
- processors
- cache settings
- experimental flags

## Head and SEO Model

### Head

`head` should not remain a separate top-level configured template or framework primitive.

Instead:

- `eco.html` owns `<head>` directly
- users think in terms of one document shell
- apps may still extract local helper components if they want, but that is app composition inside `html`, not a framework-level concept

This means the framework should remove the concept of a separately discovered or configured `Head` template.

### SEO

`seo` should not be a framework primitive.

Instead it should live in:

- starter templates
- optional helpers
- docs recipes
- app-owned components

Reason:

SEO is an application concern, not a render-pipeline primitive. Different apps want different metadata strategies, and the core framework should stay neutral.

## Explicit Routes

This proposal must work equally for filesystem and explicit routes.

Explicit routes should continue to:

- render `eco.page` views
- use layouts through the same route-shell concept
- render through the same app HTML shell concept

This matters because explicit routes already share the same renderer path. What should change is discovery policy and public naming, not the existence of a separate explicit-routes rendering model.

## Type Model

The public type surface should be renamed to match the long-term concepts.

Direction:

- stop centering type names on `head`
- fold the current `PageHeadProps` fields into the HTML shell props
- keep `locals` explicit in layout-facing types

This avoids teaching a conceptual split that the framework no longer wants.

## Migration Plan

### Phase 1

- introduce `eco.html`
- introduce `eco.layout`
- keep existing internal renderer behavior
- keep existing apps working
- preserve internal compatibility where needed while the new public model is introduced

### Phase 2

- remove `setIncludesTemplates()` and `setError404Template()`
- stop documenting `head` and `seo` as first-class global templates
- update starters so head behavior is defined directly inside `html.*`
- rename the relevant public HTML-shell props away from head-centric terminology

### Phase 3

- make `src/html.*` the preferred shell location
- switch HTML and 404 to semantic basename discovery
- enforce a single-match rule for `html.*` and `404.*`

## Compatibility

Existing apps using:

- `src/includes/html.*`
- `src/includes/head.*`
- `src/includes/seo.*`
- config-based include template naming

should keep working during a migration window.

Recommended migration target:

- move document ownership into `html.*`
- define head directly inside `html.*`
- keep SEO as app-owned code
- treat `Head` as an app helper only if a project still wants to factor it out locally

## Alternatives Considered

### Alternative A: Keep the current API and only improve docs

Pros:

- lowest implementation cost
- no migration burden

Cons:

- preserves the conceptual ambiguity
- keeps the document shell hidden behind config
- leaves weak discoverability in place

Decision:
Rejected. It does not solve the underlying public-model problem.

### Alternative B: Keep `seo` as a first-class template concept

Pros:

- aligns with some existing starter patterns

Cons:

- over-weights an application concern
- makes the framework look more opinionated than needed
- adds unnecessary global-template surface area

Decision:
Rejected. SEO should be application-owned.

### Alternative C: Keep `head` as a first-class peer of `html`

Pros:

- smaller delta from current implementation

Cons:

- weakens the conceptual integrity of `eco.html`
- keeps users thinking in multiple global shell fragments

Decision:
Rejected. `head` should conceptually belong to `html`.

### Alternative D: Put `html.*` inside `pages/`

Pros:

- everything lives near route artifacts

Cons:

- `html.*` is not a route
- complicates page scanning and route-space semantics
- adds special cases to route discovery

Decision:
Rejected. `html.*` should stay outside `pages/`.

### Alternative E: Make nested filesystem layout discovery the core abstraction

Pros:

- strong DX for file-based routes
- reduced repetition in route files

Cons:

- much higher implementation complexity
- poor fit as the primary model for explicit routes
- requires inheritance, merge, and precedence rules

Decision:
Rejected as the primary abstraction. It may still be a future optional convention.

### Alternative F: Replace layout with html entirely

Pros:

- fewer concepts on paper

Cons:

- conflates document shell and route shell
- hurts route composition
- fits router-aware integrations poorly

Decision:
Rejected. Document shell and route shell are distinct concepts.

### Alternative G: Make multiple HTML shells a core first-step feature

Pros:

- powerful for large apps with clearly different sections
- can express section-level document defaults such as `noindex`

Cons:

- increases conceptual surface area too early
- complicates migration and renderer policy decisions
- risks reintroducing ambiguity between document shell and route shell

Decision:
Rejected as a first-step feature. It remains a valid long-term extension if HTML shell selection stays layout-scoped and resolves to one effective shell per route.

## Resolved Decisions

1. `src/html.*` is the preferred long-term location for the document shell.
2. `eco.layout` should be designed as a real long-term semantic primitive.
3. Starter templates are the primary recommended path; framework fallbacks may exist for resilience.
4. `head` belongs inside `html`, not as a separate framework template.
5. `PageHeadProps` should be absorbed into an HTML-shell-first public type model.
6. HTML and 404 should follow the same semantic discovery policy.
7. Duplicate `html.*` or `404.*` matches should be treated as explicit errors.

## Recommendation

Adopt the proposal with long-term concepts leading the design.

The most important decision is to make the current render layers first-class in the public API rather than continuing to hide them behind config and generic components.

The recommended direction is:

- add `eco.html`
- add `eco.layout`
- keep `eco.page`
- keep `pages/` as route space
- keep `404.*` in `pages/`
- move the long-term document shell home to `src/html.*`
- deprecate filename-based template config
- remove `head` and `seo` from the first-class config model
- define head directly inside `html.*`
- use one semantic discovery policy for both `html` and `404`
- treat duplicate semantic matches as explicit errors
- design `eco.layout` so layout-level HTML selection can be added later without reshaping the model

This gives Ecopages a clearer long-term conceptual model without forcing a routing rewrite.