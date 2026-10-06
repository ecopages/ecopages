---
'@ecopages/core': patch
---

In development, editing a script or server module that no browser module imports now reloads the page. Before, it sent hot updates for unrelated scripts and the page kept the old code. This also makes editing an HTML Page classic script (`<script src>` without `type="module"`) under `src/pages/` reload the page.
