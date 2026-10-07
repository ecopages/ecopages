---
'@ecopages/core': patch
'@ecopages/react': patch
---

React no longer emits per-component island hydration scripts for the page owner's own Page, Layout, Html, or includes. Those files stay in the page client plan so contributors can find Foreign Children, but only React islands on another integration's page receive `hydrateRoot` scripts. The page bootstrap still hydrates the React-owned tree.

Watch-mode servers finish integration `setup()` before they log that they are listening, so the first Page request does not compete with a cold vendor build.
