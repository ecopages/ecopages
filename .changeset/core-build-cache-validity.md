---
'@ecopages/core': patch
---

Persisted build caches in `.eco` are validated before reuse:

- A cached page module is reused only while the files it imports still exist, so a partly deleted or interrupted `.eco` folder no longer crashes the build.
- Page modules are no longer imported from a pages graph that an older build wrote, for example before an upgraded build rebuilds it.
