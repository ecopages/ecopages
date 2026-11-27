---
'ecopages': patch
---

Add the `eco-commerce` template (`ecopages init <dir> --template eco-commerce`): a self-hosted storefront on Ecopages JSX, Radiant and Radiant UI that owns its catalog and database. It has dense listing pages with filters, sort and pagination, product options carried into the cart, a server-side cart with a drawer, and WebMCP tools for browser agents, and every page works without JavaScript. Data goes through a `CommerceBackend` interface whose default adapter runs Drizzle on libSQL, a local file or Turso.
