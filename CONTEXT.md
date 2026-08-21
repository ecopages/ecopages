# Ecopages

A file-based web framework for building HTML-first multi-page applications, with optional interactive islands and incremental static regeneration.

## Contents

- [Language](#language)
- [Relationships](#relationships)
- [Flagged ambiguities](#flagged-ambiguities)
- [Further reading](#further-reading)

## Language

**Page**:
A file-based route entry point that renders content for a specific URL path. Pages declare render logic, optional data-fetching, metadata, and a cache strategy.
_Avoid_: Route, view

**Layout**:
A route-level shell that wraps a page's content. Layouts provide structure (headers, navigation, footers) that persists across page navigations.
_Avoid_: Template, wrapper

**Component**:
Any reusable UI unit that can be composed into pages, layouts, or other components. Components are framework-agnostic and carry no routing semantics.
_Avoid_: Part, piece

**Html**:
The outermost document shell component that wraps the entire page (the `<html>` element and its children). There is typically one per application.
_Avoid_: Root, app shell

**Integration**:
A plugin that owns rendering for a file type (e.g., React, KitaJS, Lit, MDX). Each Integration declares a file extension, provides a renderer, and owns its hydration strategy.
_Avoid_: Plugin, adapter, template language

**Processor**:
A build-time plugin that transforms assets like stylesheets (PostCSS, Tailwind) or images. Processors are registered alongside Integrations but have distinct contracts.
_Avoid_: Plugin, asset plugin, transformer

**Static Page**:
A page with a static cache strategy (the default). Its HTML is generated at build time and served identically to all requests.
_Avoid_: Pre-rendered page

**Dynamic Page**:
A page that opts into dynamic caching (`cache: 'dynamic'`) or uses middleware. Its HTML is generated on every request.
_Avoid_: Runtime page, server page

**Cache Strategy**:
How long a rendered page is cached and when it can be revalidated. Three strategies exist: `'static'` (cache forever), `'dynamic'` (cache nothing), and `{ revalidate: number, tags?: string[] }` (time-based + tag-based revalidation, also called _revalidating cache_ or _ISR_).
_Avoid_: Cache mode, caching behavior

**Static-First Rendering**:
The architectural principle where pages are rendered as static HTML at build time by default, and only fall back to dynamic request-time rendering when necessary (e.g., when a page requires server-side data).
_Avoid_: SSG first, pre-render first

**Build-Time Rendering**:
Rendering that happens during the build phase, producing static HTML files ahead of time.
_Avoid_: Pre-rendering, static generation

**Request-Time Rendering**:
Rendering that happens when a request arrives at the server. The output depends on the request and is not pre-computed.
_Avoid_: Server-side rendering (use "dynamic page" for the cached variant), runtime rendering

**Filesystem Route**:
A route automatically discovered by scanning the pages directory. Files follow conventions (e.g., `pages/about.tsx` becomes `/about`, `pages/blog/[slug].tsx` becomes `/blog/[slug]`).
_Avoid_: Automatic route, file-based route

**Explicit Route**:
A route registered programmatically via the app API (e.g., `app.static(path, loader)` for page routes or `app.get(path, handler)` for handlers), bypassing filesystem discovery.
_Avoid_: Programmatic route, registered route

**Route Registry**:
A router module that owns the canonical record of all Filesystem Routes in one application. It is responsible for route discovery, request-time matching, and reload of the route set during development.
_Avoid_: Router service, route map

**Template Route**:
The canonical route pattern declared by a Page file, before any dynamic params are resolved. For example, `/blog/[slug]` is a Template Route.
_Avoid_: Route path, abstract route

**Static Path Expansion**:
One concrete URL path derived from a dynamic Template Route via `staticPaths`. For example, `/blog/hello-world` is a Static Path Expansion of `/blog/[slug]`.
_Avoid_: Concrete route, generated route

**Params**:
Dynamic segments captured from a page's URL path. For example, in `/blog/[slug]`, the `slug` param captures the actual value (e.g., `{ slug: 'my-post' }`).
_Avoid_: Path params, route params, URL segments

**Query**:
Search parameters from the URL string (the part after `?`). For example, `/search?q=typescript&sort=date` produces `{ q: 'typescript', sort: 'date' }`.
_Avoid_: Search params, query string

**Locals**:
Request-scoped data injected by middleware or the request pipeline (e.g., authenticated user, session, context from an upstream service). Locals are not part of the URL.
_Avoid_: Request context, server context

**Dependencies**:
Metadata declarations of what a component needs to render correctly: stylesheets, scripts, and nested components. Dependencies are not JavaScript imports — they tell the framework what to inject into the page.
_Avoid_: Requirements, imports

**Foreign Child**:
A child Component encountered during render whose owning Integration differs from the current Integration. A Foreign Child cannot be rendered inline by the current Integration and must be handed off for resolution by the owning Integration.
_Avoid_: Boundary, cross-integration child

**Foreign Subtree**:
The rendered result of a Foreign Child and any of its descendants that must be resolved by the owning Integration before control returns to the current Integration.
_Avoid_: Boundary payload, deferred boundary

**Page Browser Graph**:
The browser-reachable module graph derived from one Page and its lazy browser entries. It determines which browser code, chunks, and shared runtime code are emitted for that Page.
_Avoid_: Client bundle, app bundle, vendor graph

**SSR Policy**:
Integration-owned rules that decide how a Page or Component is rendered on the server and what browser bootstrap contract that server output requires.
_Avoid_: SSR flag, hydration mode, server toggle

**Island Host**:
A hydratable component SSR root stamped with `data-eco-island` and `data-eco-island-integration` so devtools and client runtimes can discover interactive islands without integration-specific selectors.
_Avoid_: island wrapper, hydration target

**Dev Toolbar**:
A development-only in-browser inspector injected during `ecopages dev`. It surfaces navigation, dependency, island, and accessibility diagnostics without shipping to production. Extend it by replacing `devToolbar.package` with a custom client package; integrations do not register dock apps.
_Avoid_: dev overlay, debug widget

**Sitemap**:
An optional `sitemap.xml` written during static export when enabled in app config. It lists absolute URLs for successfully exported, indexable pages plus configured `extraUrls`.
_Avoid_: URL list, crawl map

## Relationships

- A **Page** is composed from a **Component** tree, optionally wrapped by a **Layout**, all rendered within an **Html** shell
- Each **Page** declares one optional **Layout**
- Pages are discovered as **Filesystem Routes** or registered as page-owned **Explicit Routes**
- **Explicit Routes** may also register non-page handlers such as `app.get()` endpoints
- **Filesystem Routes** are classified as exact, dynamic, or catch-all based on file naming conventions
- A **Route Registry** owns the canonical set of **Filesystem Routes** for one application and supports reload during development
- Each **Filesystem Route** is stored as one **Template Route**; dynamic routes may also produce **Static Path Expansions** for build-time rendering
- Every **Page** has a **Cache Strategy** (default: `'static'`)
- **Static Pages** are generated at **Build-Time Rendering**; **Dynamic Pages** use **Request-Time Rendering**
- **Static-First Rendering** is the pattern: static by default, dynamic when necessary
- Each **Page** receives context: **Params** (from dynamic routes), **Query** (from URL), and optionally **Locals** (from middleware)
- An **Integration** owns rendering for a specific file extension; multiple Integrations coexist as peers
- A **Processor** owns transformation of non-page assets (e.g., stylesheets); Integrations and Processors are distinct
- **Dependencies** on a Component are separate from JavaScript imports; both may be needed
- When an **Integration** encounters a **Foreign Child**, it must hand off the corresponding **Foreign Subtree** to the owning **Integration** before final HTML is returned
- Each **Page** may produce one **Page Browser Graph**, including any lazy browser entries that belong to that Page
- An **Integration** may apply an **SSR Policy** per Page or Component without forcing one global browser runtime bundle for every Page
- When enabled, a **Sitemap** is written after static export hooks complete; it lists eligible **Static Path Expansions** and other exported static routes whose page metadata allows indexing
- **Page** metadata `robots.index: false` removes a route from the **Sitemap** when metadata resolves during export; metadata resolution failures omit the URL as well (fail-closed)
- `sitemap.exclude` filters eligible pathnames; `extraUrls` append non-page URLs that bypass `exclude` and page-level robots checks

## Flagged ambiguities

- "static" historically refers to "no server needed," but in ecopages it means "cached forever at build time." A **Static Page** may run on a server during **Request-Time Rendering** of other pages; it just uses pre-computed HTML. Resolved: use "Static Page" (cache strategy) not "static site" (deployment model) to avoid confusion.
- "rendering" can mean the act of converting a Component to HTML, or the runtime service that does it. Resolved: "rendering" is the act; "renderer" or "rendering service" is the service.
- Component, Layout, Page, Html all have the same underlying type shape. Resolved: they are four distinct **component roles**, not four different types. The role determines what semantic contract the component fulfills (e.g., a Layout receives `children` and context; a Component does not).

## Further reading

- [AGENTS.md](./AGENTS.md) — coding standards, documentation routing, and README maintenance
- [packages/core/README.md](./packages/core/README.md) — subsystem architecture index
- [Sitemap](./apps/docs/src/content/docs/core/sitemap.mdx) — user guide for automatic `sitemap.xml` generation
- [docs/adr/](./docs/adr/) — accepted product and release decisions
