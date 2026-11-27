---
'ecopages': patch
---

Add the `ecoshop` template (`ecopages init <dir> --template ecoshop`), a Shopify storefront on Ecopages JSX, Radiant and Radiant UI. It reads the catalog and cart from the Storefront API, or from a bundled demo catalog when no Shopify credentials are set, and its cart works without JavaScript. A verified Shopify webhook revalidates catalog pages by cache tag. Agents get the storefront tools Shopify defines (`search_catalog`, `get_product`, `create_cart`, `update_cart`, `proceed_to_checkout`, `ask_business` and more) through WebMCP in the shopper's browser and through an MCP server at `/mcp`, plus `/llms.txt`, Markdown product views and schema.org Product JSON-LD. Connected to a Shopify store, it also forwards the store's UCP profile and endpoint.
