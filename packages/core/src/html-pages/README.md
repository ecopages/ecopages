# HTML Pages

This directory owns `.html` Filesystem Routes: plain HTML files under `src/pages/` rendered inside the application's Html shell with the app's default Cache Strategy. HTML Pages need no package, plugin call, or config field.

## Ownership

`finalizeEcoPagesConfig()` appends the internal `html-pages` Integration after user Integrations, unless a user Integration already declares `.html`. Appending last keeps the first-extension fallback for missing semantic templates unchanged for existing apps. There is no public plugin factory.

| File                          | Role                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `html-pages.plugin.ts`        | `HtmlPagesPlugin`: owns `.html` with `HtmlPageRenderer`, implements `compilePageModule`, sets `acceptsParams = false` |
| `html-page-template.ts`       | Compiles a Page or Html shell file into template parts, asset declarations, head nodes, and metadata                  |
| `html-page-module.ts`         | Builds the Page or shell module in-process and owns the built-in shell                                                |
| `html-page-renderer.ts`       | `StringMarkupRenderer` subclass: emits assets in place, renders the shell, wires head reconciliation                  |
| `html-page-document.ts`       | Reconciles Page head tags and `<html>`/`<body>` attributes onto the finalized document                                |
| `html-page-classic-script.ts` | Decides how a classic `<script src>` is emitted: `.js` copied, TypeScript types stripped, module syntax rejected      |

Parsing uses `services/html/html-source-parser.ts`, a positional parser built on the same tokenizer as `HtmlRewriter` (`services/html/html-tokenizer.ts`).

## Module loading

Core never checks for HTML Pages by name. It finds a file's owning Integration with `findIntegrationForFile()` (the longest registered extension) and asks it:

- `PageModuleImportService.loadModule()` calls the owner's `compilePageModule()` before bundling. `HtmlPagesPlugin.compilePageModule()` compiles files under the pages directory and `src/includes/html.html` with `loadHtmlPageModule()`, and returns `undefined` for any other `.html` file. Bun, Node, and Vite-hosted apps load HTML Pages the same way, and the import cache still keys modules by file hash.
- `isPagesUnifiedGraphPage()` leaves out Pages whose owner implements `compilePageModule`, so HTML Pages stay out of the production unified graph.
- Route discovery rejects `[param]` filenames whose owner sets `acceptsParams` to `false`, because HTML Pages have no `staticPaths`.

Each component carries its compiled template on an interned symbol, read with `getCompiledHtmlTemplate()`. Calling the component directly throws, because rendering needs the owning renderer's asset pipeline. A Page component also exposes `metadata`, built from its head tags and merged over `defaultMetadata`, so static export and the Sitemap read it like an `eco.page()` Page.

The Page and `html.html` components register their local asset files as discovered watch files on their identity. `collectRenderShellSourcePaths()` adds identity watch files to rendered HTML cache dependencies, so editing a referenced stylesheet or script invalidates every route the Page or shell renders into, including routes owned by other Integrations that use `html.html`.

## Compilation

A Page is read into three parts:

- **Head nodes**: children of the Page `<head>`, with a singleton key for `<title>`, `<base>`, `<meta charset>`, keyed `<meta>` (`name`, `property`, `http-equiv`), and `<link rel="canonical">`. A second `<head>` is an error.
- **Body markup**: everything outside the `<head>`, with the doctype and the `<html>` and `<body>` start and end tags removed.
- **Root attributes**: the attributes of the Page `<html>` and `<body>` elements.

An Html shell must contain `<html>` with `<head>` and `<body>` and exactly one `<!-- eco:children -->` comment, which becomes the children slot. Its doctype is dropped because the renderer always emits one.

Processed asset tags become slots:

| Tag                                              | Processing                                                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `<link rel="stylesheet">` with a relative `href` | `FileStylesheetProcessor`                                                                                                           |
| `<style>` with no `type`, or `type="text/css"`   | `ContentStylesheetProcessor` inline; `processingOrigin` is `<file>.css`                                                             |
| `<script type="module">` with a relative `src`   | `FileScriptProcessor`, bundled as a browser module                                                                                  |
| classic `<script>` with a relative `src`         | `FileScriptProcessor`: `.js` copied as written (`bundle: false`); TypeScript has only its types stripped; module syntax is an error |

`processingOrigin` sits beside the HTML file and ends in `.css` because processors resolve relative imports against it and filter by extension.

Relative paths, with or without `./`, resolve against the containing file and must stay inside the source directory; query strings and fragments are ignored for the lookup. A processed tag with `integrity` is an error. Tags with external or root-relative URLs, inline scripts, and scripts with a non-JavaScript `type` stay literal. In development, a relative `src`, `srcset`, or `href` left literal logs a warning once per file revision, except an `href` on `<a>`, `<area>`, or `<base>`.

## Rendering

`HtmlPageRenderer.renderHtmlPage()` processes the Page's asset declarations and splices each emitted URL (or processed CSS) into the tag as written, so every other attribute is preserved. A missing local file, or an asset the pipeline cannot process, throws an error naming the HTML file. A local file declared by both the shell and the Page is emitted once, by the shell; within a file, the first declaration wins. The body markup then renders through the shared document-shell composition, so an `html.html`, built-in, JSX, or React shell wraps it the same way. When the rendered shell has no `<body>` (JSX shells that leave it to Layouts), the Page markup is wrapped in one.

When no `src/includes/html.*` exists, `HtmlPageRenderer.getHtmlTemplate()` returns the built-in shell (`lang="en"`, charset, viewport, children slot). Pages owned by other Integrations keep the existing missing-template error. A Page owned by another Integration whose shell is `html.html` delegates the shell to this renderer through the foreign-child path; `renderComponent()` renders it with its assets emitted in place.

## Head reconciliation

The renderer's route adapter captures the rendered Page head and wraps `transformRouteResponse()`, so `reconcileHtmlPageDocument()` runs after Integration and core head contributions are in the document:

- A Page singleton replaces the first shell tag with the same key, in place. This includes the core robots tag built from `metadata.robots`.
- A Page `<meta charset>` matching the shell is dropped; a different encoding is an error naming the Page. A Page charset or `<base>` without a shell copy is inserted at the start of `<head>`.
- Every other Page head node is inserted before `</head>` in source order.
- Page `<html>` and `<body>` attributes replace shell values, except `class`, whose tokens are joined.

Reconciliation runs only for HTML Pages; other routes keep their head output.

## Discovery rules

`RouteRegistry` rejects a dynamic `.html` filename (no `staticPaths` source). It also rejects any two Page files that produce the same Template Route, for every Integration, such as `about.html` with `about.tsx` or `about/index.html`.

## Tests

- `html-page-template.test.ts`: extraction, metadata, asset classification, compile errors
- `html-page-document.test.ts`: head reconciliation and root attribute merging
- `html-page-module.test.ts`: which `.html` files core loads, metadata merge, shell compile errors
- `services/html/html-source-parser.test.ts`: source offsets, raw text, implicit head close
- `router/server/route-registry.test.ts`: duplicate routes and dynamic `.html` filenames
- `e2e/fixtures/html-pages`: static export, Sitemap, `404.html`, and browser-router navigation
