---
'@ecopages/core': patch
---

In `ecopages dev`, a client navigation to a page that first imports a new package no longer reloads the page, and a rebuild of the vendor files no longer reloads pages that did not load the changed files. The first import from a package now builds the whole package into one file, with a small file for each of its subpaths, and an import of the package's other subpaths or of another package changes none of the files a browser already loaded. A package file changes only when the package changes on disk, and then only the pages that loaded it reload. Packages with more than 1,000 JavaScript files are served as one file for each module.
