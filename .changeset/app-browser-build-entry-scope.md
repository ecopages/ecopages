---
'@ecopages/core': patch
---

Build production browser entries of every Integration in one app-wide build, so a package or module that React islands, Lit scripts and other entries share is one chunk and is evaluated once. Entries only build apart when `define`, `minify`, `treeshaking` or plugin exclusions differ.
