---
'@ecopages/core': patch
---

During development, edits to files used by Components, Includes, Layouts, explicit views, and discovered factory modules mark affected Pages dirty. New source files are observed even when copied with preserved timestamps, and server-source edits invalidate cached HTML documents.

The dev server reports ready after filesystem subscriptions are active, so edits made immediately after startup are observed.
