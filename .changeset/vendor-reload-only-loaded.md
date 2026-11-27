---
'@ecopages/core': patch
---

In `ecopages dev`, a client navigation to a page that first imports a new package no longer reloads the page, and a rebuild of the vendor files no longer reloads pages that did not load the changed files. The vendor build now keeps every package module as its own file, named after its path and carrying all of its exports, so adding a package adds files and leaves the ones a browser already loaded unchanged. A page loads more vendor files than before (ecoshop's cart page loads 314). When a file does change, such as a package edited on disk, the server sends the changed URLs and only a page that loaded one of them reloads.
