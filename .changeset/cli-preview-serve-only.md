---
'ecopages': patch
'@ecopages/core': patch
---

`ecopages preview --serve-only` is accepted by the published CLI again. The `--keep-going` and `--serve-only` entry flags are now declared once in `@ecopages/core` and read by both the CLI wrapper and the app entry parser, so a new flag cannot be rejected by one and accepted by the other.
