---
'@ecopages/core': patch
---

After upgrading a package used in the browser, the development server now serves the new version instead of a stale copy. Files under `/assets/vendors` are no longer marked `immutable` in development; browsers revalidate them on each load with an `ETag` and get `304 Not Modified` while a file is unchanged. This covers integration runtime files whose names do not change between versions, such as React's. Bare imports that are prebundled on demand now also get a new URL when the installed package version changes, including for aliased installs and across restarts.
