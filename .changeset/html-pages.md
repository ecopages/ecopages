---
'@ecopages/core': minor
---

Add HTML Pages: a plain `.html` file under `src/pages/` is a Filesystem Route that needs no Integration or option in your config. A Page can be a body fragment, a `<head>` plus body markup, or a complete document; without a `<head>`, its leading `<title>`, `<meta>`, `<link>` and similar tags form the head, as in a browser. It renders inside the app's `src/includes/html.*`, which can now also be plain HTML (`html.html` with one `<!-- eco:children -->` marker), or a built-in shell when there is none. Page `<title>`, `<base>`, canonical, and keyed `<meta>` tags replace the shell's in place, `<html>` and `<body>` attributes merge, and local stylesheets, `<style>` blocks, and scripts are processed and emitted where they were written; the module scripts of all Pages and the shell are built together, so a module they share runs once, also across browser-router navigations. A stylesheet must be linked with `<link rel="stylesheet">`: a module script that imports one, as in `import './styles.css'`, makes its Page fail to render with an error naming the HTML file and the stylesheet. `404.html` and `500.html` work as error pages, and Page head tags feed page metadata and the Sitemap.

**Breaking:**

- Every app now routes `.html` files under `src/pages/`, which core previously ignored. An existing `.html` file there becomes a Page; move it out of `src/pages/` (to `src/public/` to serve it as written).
- Route discovery fails when two Page files produce the same route, such as `about.tsx` next to `about/index.tsx`, instead of letting discovery order pick one. Delete or rename one of the files. Dynamic `.html` filenames such as `[slug].html` are also rejected.
- `.html` now counts for semantic templates, so `src/includes/html.html` next to `html.tsx`, or `src/pages/404.html` next to `404.tsx`, fails with "Multiple … templates found". Keep one of each.

For integration and processor authors: a file script asset with `bundle: false` is now copied as written in development too, matching production, instead of being built by the HMR entrypoint server. Content stylesheet assets accept `processingOrigin`, the path processors receive for inline CSS.
