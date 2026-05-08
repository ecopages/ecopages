# Ecopages

A file-based web framework for building HTML-first multi-page applications, with optional interactive islands and incremental static regeneration.

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
A route automatically discovered by scanning the pages directory. Files follow conventions (e.g., `pages/about.tsx` becomes `/about`, `pages/blog/[slug].tsx` becomes `/blog/:slug`).
_Avoid_: Automatic route, file-based route

**Explicit Route**:
A route registered programmatically via the app configuration (e.g., `app.static(path, loader)`), bypassing filesystem discovery.
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

## Relationships

- A **Page** is composed from a **Component** tree, optionally wrapped by a **Layout**, all rendered within an **Html** shell
- Each **Page** declares one optional **Layout**
- Pages are discovered as either **Filesystem Routes** or registered as **Explicit Routes**
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

## Example dialogue

> **Dev:** "How do I make a blog page that renders its posts at build time?"
> **Domain expert:** "Create a **Page** with `cache: 'static'` (the default). Use `staticProps` to fetch the post list at **Build-Time Rendering**, and return it as props. That's a **Static Page** — its HTML is generated once and served to everyone."
>
> **Dev:** "What if I want a search page that shows different results based on the query?"
> **Domain expert:** "That needs **Dynamic Page** — set `cache: 'dynamic'`. The **Page** receives **Query** params from the URL string, so you can render different content per search. HTML is generated on every request via **Request-Time Rendering**."
>
> **Dev:** "Can I write both in React?"
> **Domain expert:** "Yes. The React **Integration** owns rendering for `.tsx` files. Both Static and Dynamic Pages use the same render API — the difference is just the **Cache Strategy** you pick."
>
> **Dev:** "What's the difference between **Params** and **Query**?"
> **Domain expert:** "**Params** come from the URL path structure. If you have a route `/blog/[slug]`, then `/blog/my-post` gives you `params: { slug: 'my-post' }`. **Query** comes from the search string — `/search?q=typescript` gives you `query: { q: 'typescript' }`. **Params** are structural; **Query** is filtering."
>
> **Dev:** "Where do I put styling?"
> **Domain expert:** "List it in **Dependencies**. If a **Component** has its own CSS file, declare it there. That's metadata telling the framework 'inject this stylesheet.' Don't mix it up with JavaScript imports — you need both: import the component AND declare it in dependencies if it has dedicated styles."
>
> **Dev:** "Can I use Redux or context in a page?"
> **Domain expert:** "Only in **Dynamic Pages**, because those render on every request. **Static Pages** are pre-rendered, so there's no server to hold state. If you need per-user state, use **Dynamic Page** with **Locals** — inject user data from middleware."

## Flagged ambiguities

- "static" historically refers to "no server needed," but in ecopages it means "cached forever at build time." A **Static Page** may run on a server during **Request-Time Rendering** of other pages; it just uses pre-computed HTML. Resolved: use "Static Page" (cache strategy) not "static site" (deployment model) to avoid confusion.
- "rendering" can mean the act of converting a Component to HTML, or the runtime service that does it. Resolved: "rendering" is the act; "renderer" or "rendering service" is the service.
- Component, Layout, Page, Html all have the same underlying type shape. Resolved: they are four distinct **component roles**, not four different types. The role determines what semantic contract the component fulfills (e.g., a Layout receives `children` and context; a Component does not).
- "FSRouter" describes the current implementation name, but the deeper concept is the **Route Registry**. Resolved: use "Route Registry" for the architecture and treat "FSRouter" as legacy implementation terminology.
