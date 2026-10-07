---
'@ecopages/core': patch
'@ecopages/react': patch
---

React no longer emits per-component island hydration scripts for the page owner's own Page, Layout, Html, or includes. Those files stay in the page client plan so contributors can find Foreign Children, but only React islands on another integration's page receive `hydrateRoot` scripts. The page bootstrap still hydrates the React-owned tree.

Watch-mode servers finish integration `setup()` before they log that they are listening. Routes listed in `devPrewarmBeforeReadyPaths` are rendered before that log, so the first browser navigation reuses the compiled client graph instead of compiling it during the request.
