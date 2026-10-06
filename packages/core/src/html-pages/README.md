# HTML Pages

This directory owns `.html` Filesystem Routes: plain HTML files under `src/pages/` rendered inside the application's Html shell with the app's default Cache Strategy. HTML Pages need no package, plugin call, or config field.

## Ownership

`finalizeEcoPagesConfig()` appends the internal `html-pages` Integration after user Integrations, unless a user Integration already declares `.html`. Appending last keeps the first-extension fallback for missing semantic templates unchanged for existing apps. There is no public plugin factory.

| File                          | Role                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `html-pages.plugin.ts`        | `HtmlPagesPlugin`: owns `.html` with `HtmlPageRenderer`, implements `compilePageModule`, sets `acceptsParams = false` |
| `html-page-template.ts`       | Compiles a Page or Html shell file into template parts, asset declarations, head nodes, metadata, and social tags     |
| `html-page-module.ts`         | Builds the Page or shell module in-process and owns the built-in shell                                                |
| `html-page-renderer.ts`       | `StringMarkupRenderer` subclass: emits assets in place, renders the shell, reconciles the head                        |
| `html-page-document.ts`       | Reconciles Page head tags and `<html>`/`<body>` attributes onto the finalized document                                |
| `html-page-module-scripts.ts` | Builds every HTML Page's and the shell's module scripts together and maps each script to its URL                      |
| `html-page-classic-script.ts` | Validates a classic `<script src>` and marks it `classic`: module-only code, JSX and compile helpers are rejected     |

Parsing uses `services/html/html-source-parser.ts`, a positional parser built on the same tokenizer as `HtmlRewriter` (`services/html/html-tokenizer.ts`).

## Module loading

Core never checks for HTML Pages by name. It finds a file's owning Integration with `findIntegrationForFile()` (the longest registered extension) and asks it:

- `PageModuleImportService.loadModule()` calls the owner's `compilePageModule()` before bundling. `HtmlPagesPlugin.compilePageModule()` compiles files under the pages directory and `src/includes/html.html` with `loadHtmlPageModule()`, and throws for any other `.html` file; an Integration that implements the hook compiles every file core loads for it. Bun, Node, and Vite-hosted apps load HTML Pages the same way, and the import cache still keys modules by file hash.
- `isPagesUnifiedGraphPage()` leaves out Pages whose owner implements `compilePageModule`, so HTML Pages stay out of the production unified graph.
- Route discovery rejects `[param]` filenames whose owner sets `acceptsParams` to `false`, because HTML Pages have no `staticPaths`.

Each component carries its compiled template on an interned symbol, read with `getCompiledHtmlTemplate()`. Calling the component directly throws, because rendering needs the owning renderer's asset pipeline. A Page component also exposes `metadata`, built from its head tags and merged over `defaultMetadata`, so static export and the Sitemap read it like an `eco.page()` Page.

The Page and `html.html` components register their local asset files as discovered watch files on their identity. `collectRenderShellSourcePaths()` adds identity watch files to rendered HTML cache dependencies, so editing a referenced stylesheet or script invalidates every route the Page or shell renders into, including routes owned by other Integrations that use `html.html`.

## Compilation

A Page is read into three parts:

- **Head nodes**: children of the Page `<head>`. Without one, the leading `<title>`, `<meta>`, `<link>`, `<style>`, `<script>`, `<base>` and `<template>` elements form the head, as the HTML parsing rules do: the doctype, whitespace and comments are skipped, and the first other element, `<noscript>` or text ends it. Head nodes have a singleton key for `<title>`, `<base>`, `<meta charset>`, keyed `<meta>` (by the value of the first of `name`, `property` and `http-equiv` it has, so `property="twitter:title"` and `name="twitter:title"` are the same tag), and `<link rel="canonical">`. A second `<head>` is an error. When the Page has a `<title>` or a description `<meta>`, the compiler appends `og:title`, `og:description`, `twitter:title`, and `twitter:description` from them, unless the Page writes that tag itself. Other social tags, such as `og:image`, `og:type`, and `twitter:card`, are never derived.
- **Body markup**: everything outside the head (the `<head>` element or the leading head elements), with the doctype and the `<html>` and `<body>` start and end tags removed.
- **Root attributes**: the attributes of the Page `<html>` and `<body>` elements.

An Html shell must contain `<html>` with `<head>` and `<body>` and exactly one `<!-- eco:children -->` comment, which becomes the children slot. Its doctype is dropped because the renderer always emits one.

Processed asset tags become slots:

| Tag                                                                    | Processing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<link rel="stylesheet">` with a relative `href`                       | `FileStylesheetProcessor`; production names the file from a hash of the processed CSS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `<style>` with no `type`, or `type="text/css"`                         | `ContentStylesheetProcessor` inline; `processingOrigin` is `<file>.css`; a `</style` in the output is escaped as `<\/style`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `<script type="module">` with a relative `src`                         | Without HMR, one multi-entry build of every HTML Page's and the shell's module scripts (`html-page-module-scripts.ts`); with HMR, `FileScriptProcessor` and the HMR manager; a side-effect `.css` import is an error (see Rendering)                                                                                                                                                                                                                                                                                                                                                                            |
| classic `<script>` with a relative `src`                               | `FileScriptProcessor` with `classic: true`: compiled on its own in script mode, ignoring `tsconfig.json`, and minified in production without renaming top-level names or dropping legal comments; never bundled, outside the HMR pipeline (in development, editing one reloads the page, except under `src/includes/` or `src/views/`, where edits refresh the page in place), and emitted under the source path and name (`.ts` becomes `.js`), without a content hash. JSX files, module syntax, relative `import()`, top-level `await` and code that needs a compile helper (such as a decorator) are errors |
| `<link rel="preload">` or `rel="modulepreload"` with a relative `href` | Not processed itself: at render it takes the URL of the asset with the same file and the kind it preloads (`modulepreload` a module script, `as="style"` a stylesheet, `as="script"` a classic script) in the Page or the shell (the shared build's URL, or the HMR URL); with none, it stays as written and a development warning names it                                                                                                                                                                                                                                                                     |

With [`@ecopages/browser-router`](../../../browser-router/README.md#scripts-on-navigation), a classic script in the Page body runs again on every navigation that renders it, so its top-level `const`, `let` and `class` declarations would be declared twice and throw. Such scripts should use `var` or functions, or wrap the code in a block or an IIFE; a module script runs once per URL.

`processingOrigin` sits beside the HTML file and ends in `.css` because processors resolve relative imports against it and filter by extension.

Relative paths, with or without `./`, resolve against the containing file and must stay inside the source directory, except a preload `href`, which then matches no processed file; query strings and fragments are ignored for the lookup. A processed tag with `integrity` is an error, and so is a preload hint with `integrity` that matches a processed file; an unmatched one stays as written with the usual warning. Tags with external or root-relative URLs, inline scripts, and scripts with a non-JavaScript `type` stay literal.

An inline `<script type="module">` that imports a relative specifier (`./` or `../`), statically, by re-export, or by a dynamic `import()` of a string literal, is a compile error naming the file and asking to move the code to a file. It is not sent through the inline content-script path (`AssetFactory.createInlineContentScript()`): that path builds each script alone from an entry file in the work directory, so a relative import would resolve against the wrong directory, and a module the script shares with the Page's module scripts would be a second copy that runs again, the duplication the shared build exists to avoid. Bare and root-relative imports, and non-literal dynamic imports, stay literal.

In development, a relative URL left literal logs a warning once per file revision: `src`, `srcset`, `imagesrcset`, `href` (except on `<a>`, `<area>`, `<base>`, and preload links), `xlink:href` (except on `<a>`, `<area>`, and `<base>`), `poster`, `<object data>`, and `url()` or an `image-set()` string in a `style` attribute, outside comments. The `content` of `og:image`, `og:image:url`, `og:image:secure_url`, `twitter:image`, and `twitter:image:src` warns unless it is an absolute URL, because link preview crawlers need one.

Two warnings depend on rendering and are logged by the renderer through `warnHtmlTemplateRender()`, once per URL or preload `href` and revision of the file, building the message only when it logs: a relative URL that processed `<style>` output still holds, and a preload hint that matches no processed file. The preload warning names the fix: the right `rel` or `as` when the file is processed as another kind; for a preload of a stylesheet or script, the other HTML files that load the file (found with `findHtmlFilesLoading()`, which compiles every HTML file, so it runs only in development and at most once per file revision), asking a Page to load the file too and a shell to move the preload to those Pages; otherwise a move to the public directory. Within one `emitAssets()` call, a preload and its target share one URL lookup, so the file is processed once.

## Rendering

`HtmlPageRenderer.renderHtmlPage()` processes the Page's asset declarations and splices each emitted URL (or processed CSS) into the tag as written, so every other attribute is preserved. A missing local file, or an asset the pipeline cannot process, throws an error naming the HTML file. A local file declared by both the shell and the Page is emitted once, by the shell; within a file, the first declaration wins. The body markup then renders through the shared document-shell composition, so an `html.html`, built-in, JSX, or React shell wraps it the same way. When the rendered shell has no `<body>` (JSX shells that leave it to Layouts), the Page markup is wrapped in one.

Without HMR, module scripts are not processed one by one. The first render builds every module script of every HTML Page and the `html.html` shell in one build with code splitting, so a module several scripts import, on one Page or across Pages, is one chunk with one URL, and a script has the same URL on every Page; the browser runs each once, also across browser-router navigations. Production builds once; otherwise the build is reused while the HTML files, the scripts, and the local modules the stylesheet scan visits from them keep their size and modification time; an edit inside a package is not detected. An HTML file that does not compile is left out of the build, so only its own render fails; a script that does not build fails the build, and so every HTML Page with a module script, until the next render builds again.

A module script cannot add a stylesheet to the Page: the PostCSS Processor turns a CSS file into a module exporting the CSS string, and without a CSS Processor the bundler rejects it. So `scanModuleScript()` scans a module script and the local modules it imports, statically or dynamically, for a side-effect stylesheet import: an import or re-export that binds nothing (`import './styles.css'`, `export * from './styles.css'`) of a file ending in `.css`, local or in a package (`import 'swiper/css'`). The shared build leaves such a script out, and rendering an HTML file that loads it, with or without HMR, throws an error naming the HTML file, the stylesheet, and the importing module when it is not the script itself, with paths relative to the app root. For a stylesheet under `src` it suggests `<link rel="stylesheet" href="…">` in the HTML file; for one outside `src`, as in a package, it says to copy the file under `src` and link it. Other HTML Pages still render. The scan does not follow type-only imports or scan packages, and skips the stylesheet imports the component meta transform moves into Component Dependencies. `import styles from './styles.css'`, which binds the CSS string, is allowed; without a CSS Processor it still fails the whole build. With HMR, the scan result is reused while the files it visited keep their size and modification time.

When no `src/includes/html.*` exists, `HtmlPageRenderer.getHtmlTemplate()` returns the built-in shell (`lang="en"`, charset, viewport, children slot). Pages owned by other Integrations keep the existing missing-template error. A Page owned by another Integration whose shell is `html.html` delegates the shell to this renderer through the foreign-child path; `renderComponent()` renders it with its assets emitted in place.

## Head reconciliation

The renderer's route adapter captures the rendered Page head and wraps `transformRouteResponse()`, so `reconcileHtmlPageDocument()` runs after Integration and core head contributions are in the document. A direct `HtmlPageRenderer.render()` call, outside a route render, reconciles the HTML it returns the same way:

- A Page singleton, including a derived social tag, replaces the first shell tag with the same key, in place. This includes the core robots tag built from `metadata.robots`.
- A Page `<meta charset>` matching the shell is dropped; a different encoding is an error naming the Page. A Page charset or `<base>` without a shell copy is inserted at the start of `<head>`.
- Every other Page head node is inserted before `</head>` in source order.
- Page `<html>` and `<body>` attributes replace shell values, except `class`, whose tokens are joined.

Reconciliation runs only for HTML Pages; other routes keep their head output.

## Discovery rules

`RouteRegistry` rejects a dynamic `.html` filename (no `staticPaths` source). It also rejects any two Page files that produce the same Template Route, for every Integration, such as `about.html` with `about.tsx` or `about/index.html`.

## Tests

- `html-page-template.test.ts`: extraction, metadata, social tags, asset classification, preload hints, relative-URL and social image warnings, CSS URL extraction, inline module scripts with relative imports, compile errors
- `html-page-document.test.ts`: head reconciliation and root attribute merging
- `html-page-module.test.ts`: which `.html` files core loads, warnings once per file revision, inline module script import errors, metadata merge, shell compile errors
- `html-pages.plugin.test.ts`: which files `compilePageModule()` compiles or rejects
- `html-page-renderer.test.ts`: built-in shell, JSX shells without `<body>`, delegated shells, asset dedupe, preload hints (Page and shell stylesheets, shared-build and HMR module script URLs, kind mismatches, `integrity`, unmatched warnings for a Page and the shell), relative `url()` in processed `<style>`, warned again after an edit, missing assets, head on a direct `render()`, the shared module-script build (one chunk per shared module, stable URLs, no other Page's code, rebuild after an edit, a fix, or a new script, a broken Page left out, entries that differ only by extension)
- `html-page-classic-script.test.ts`: the classic script rule, including a real build of a TypeScript classic script run as a classic script
- `services/html/html-source-parser.test.ts`: source offsets, raw text, implicit head close
- `router/server/route-registry.test.ts`: duplicate routes and dynamic `.html` filenames
- `e2e/fixtures/html-pages`: static export, Sitemap, `404.html`, browser-router navigation, and a custom element shared by several Pages' scripts defined once
