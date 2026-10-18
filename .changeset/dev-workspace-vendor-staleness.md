---
'@ecopages/core': patch
---

In development, a browser import of a workspace-linked package (for example a pnpm `workspace:` dependency) now gets a new prebundled file after you edit any file of that package, not only its entry file, so restarting the development server serves the edited code instead of a stale copy.
