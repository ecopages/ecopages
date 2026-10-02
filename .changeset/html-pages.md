---
'@ecopages/core': minor
---

Add HTML Pages: a plain `.html` file under `src/pages/` is a Filesystem Route with no Integration or config. A Page can be a body fragment, a `<head>` plus body markup, or a complete document. It renders inside the app's `src/includes/html.*`, which can now also be plain HTML (`html.html` with one `<!-- eco:children -->` marker), or a built-in shell when there is none. Page `<title>`, `<base>`, canonical, and keyed `<meta>` tags replace the shell's in place, `<html>` and `<body>` attributes merge, and local stylesheets, `<style>` blocks, and scripts are processed and emitted where they were written. `404.html` and `500.html` work as error pages, and Page head tags feed page metadata and the Sitemap.

**Breaking:**

- Every app now routes `.html` files under `src/pages/`, which core previously ignored. An existing `.html` file there becomes a Page; move it out of `src/pages/` (to `src/public/` to serve it as written).
- Route discovery fails when two Page files produce the same route, such as `about.tsx` next to `about/index.tsx`, instead of letting discovery order pick one. Delete or rename one of the files. Dynamic `.html` filenames such as `[slug].html` are also rejected.
- `.html` now counts for semantic templates, so `src/includes/html.html` next to `html.tsx`, or `src/pages/404.html` next to `404.tsx`, fails with "Multiple … templates found". Keep one of each.

For integration and processor authors: a file script asset with `bundle: false` is now copied as written in development too, matching production, instead of being built by the HMR entrypoint server. Content stylesheet assets accept `processingOrigin`, the path processors receive for inline CSS.
