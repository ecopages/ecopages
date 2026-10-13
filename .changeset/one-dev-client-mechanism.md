---
'@ecopages/core': minor
---

The HMR client and the Dev Toolbar client now share one bundling, serving and HTML injection mechanism, and the server adapter asks the HMR manager whether to load them instead of reading the watch option itself.

**Breaking:** `IHmrManager` has a new required method, `injectDevClientRuntimes(response)`. A custom manager must implement it: return the HTML response with a `<script type="module">import '<url>';</script>` for each client runtime that was built added before `</html>`, and return the response unchanged while `isEnabled()` is false. The server adapter injects dev client runtimes only when `isEnabled()` is true, so a manager that reports disabled receives no injection calls. Managers extending the core `SharedHmrManager` need no change.

The Dev Toolbar now loads only while HMR is enabled. When the HMR runtime fails to bundle, the Node runtime disables HMR for the session and the Dev Toolbar is no longer loaded either, where before the page kept the toolbar. A toolbar that cannot be bundled still leaves HMR on.
