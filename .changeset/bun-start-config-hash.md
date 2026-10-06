---
'@ecopages/core': patch
---

Fix `ecopages start --runtime bun` refusing a Bun build with "Ecopages config mismatch". The build now records the config hashes in `dist/.server/manifest.json` with SHA-256 under every runtime, the same hash `start` checks. Rebuild an existing Bun build once; Node builds are unaffected.
