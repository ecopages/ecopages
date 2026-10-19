---
'@ecopages/core': patch
---

**Breaking:** a query key repeated in the URL (`?tag=a&tag=b`) is now an array of its values in page, API and WebSocket handlers instead of its last value. A key that appears once stays a string. Schemas that expect a string answer HTTP 400 for repeated keys; accept both shapes with `z.union([z.string(), z.array(z.string())])`. WebSocket upgrade handlers now share the page and API query parser, and `search` on WebSocket sockets and `context()` input is typed like `PageQuery`.
