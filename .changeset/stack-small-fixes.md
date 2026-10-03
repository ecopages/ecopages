---
'@ecopages/core': patch
---

- Incremental static export detects changes under Processor watch paths by file size and modification time instead of reading every file, so image-heavy watch paths no longer slow each build.
- Running the app entry as `ecopages dev`, `build`, or `preview` no longer also reports the `start` command.
- Errors about `src/includes/html.html` call it the HTML template, as the docs do.
