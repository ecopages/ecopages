---
'ecopages': patch
---

Fix the starter templates: counters serialize `count` with `attr:count`, canonical links use a shared site-origin helper that also feeds `baseUrl`, and the app root comes from `process.cwd()` so `ecopages start` keeps Tailwind request-time stylesheets non-empty.
