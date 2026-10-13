---
'@ecopages/core': patch
---

A Dev Toolbar that cannot be bundled no longer turns off hot reloading in `ecopages dev`. When `devToolbar.package` is not installed or fails to bundle, the log now reports that the Dev Toolbar could not be bundled, and pages keep their HMR client and receive updates. Before, a missing package stopped the dev server from finishing startup, and a package that failed to bundle left every page without HMR for the session.
