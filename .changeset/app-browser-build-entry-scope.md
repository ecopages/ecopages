---
'@ecopages/core': patch
---

Build production browser entries of every Integration in one app-wide build, so a package or module that React islands, Lit scripts and other entries share is one chunk and is evaluated once. Entries only build apart when `define`, `minify`, `treeshaking` or plugin exclusions differ.

A plugin that only some entries declare now applies only to modules those entries reach, through the new `EcoBuildPlugin.entryScope`. A module such a plugin changed and another entry also imports fails the build with the module, plugin and entries named, instead of shipping two copies.
