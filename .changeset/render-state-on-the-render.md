---
'@ecopages/core': minor
---

Renders of one Integration run at the same time. A static export of a site with one Integration now renders as many pages in parallel as it has workers instead of one at a time.

**Breaking:** An Integration renderer keeps no assets between renders. The assets a render collects belong to that render, and the HTML transformer injects the page package it is given on each call instead of holding one. A renderer that set or read the transformer's page package or processed dependencies, or called `appendProcessedDependencies` outside a render, must work from the page package of its render instead; appending outside a render now throws. `finalizeDocumentShellHtml`, `applyDocumentShellAttributeStamping` and the `DocumentShellAttributeStamping` type are removed from `@ecopages/core/route-renderer/orchestration/document-shell/document-shell-render.service`; nothing in core called them.
