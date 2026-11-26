# Ecoshop template

A Shopify storefront built with Ecopages JSX and [Radiant UI](https://radiant-ui.ecopages.app), made to be used by shoppers and by AI agents. Catalog pages are cached and revalidated by tag, the cart works without JavaScript, and agents can browse and fill a cart through an MCP server.

Without Shopify credentials it runs on a bundled demo catalog, so `pnpm dev`, `pnpm build` and CI work offline.

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). A banner says the store is in demo mode.

## Connect a Shopify store

1. In Shopify admin, install the [Headless](https://apps.shopify.com/headless) sales channel, create a storefront, and copy its public Storefront API access token. Its Storefront API permissions must include reading product listings (`unauthenticated_read_product_listings`) and reading and writing carts (`unauthenticated_read_checkouts`, `unauthenticated_write_checkouts`).
2. Copy `.env.example` to `.env` and set:

| Variable                          | Required         | Meaning                                                                                                                                                                                           |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHOPIFY_STORE_DOMAIN`            | with the token   | The store domain, such as `my-store.myshopify.com`.                                                                                                                                               |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | with the domain  | The public Storefront API token.                                                                                                                                                                  |
| `SHOPIFY_API_VERSION`             | no               | Storefront API version. Defaults to `2026-10`, pinned in `src/lib/commerce/provider.server.ts`.                                                                                                   |
| `SHOPIFY_WEBHOOK_SECRET`          | for revalidation | The secret Shopify signs webhooks with.                                                                                                                                                           |
| `ECOPAGES_BASE_URL`               | in production    | The public origin: canonical links, JSON-LD, `/llms.txt` and MCP URLs use it, and `/api/cart` and `/mcp` accept browser requests from it. Behind a proxy, set it or browser cart posts get `403`. |

Set both Shopify variables or neither: with one alone, `pnpm build` fails and every page answers with an error, instead of quietly serving the demo catalog. Secrets are only read in `.server` modules.

Checkout is Shopify's own: the cart links to the cart's `checkoutUrl`.

## Revalidation webhook

Catalog pages use `cache: { revalidate: 300, tags }`: the home and collection pages carry the `products` and `collections` tags, product pages `products`. `POST /api/revalidate` verifies Shopify's `X-Shopify-Hmac-Sha256` signature and invalidates the tags for the topic:

| Topics                                   | Tag invalidated |
| ---------------------------------------- | --------------- |
| `products/*`, `product_listings/*`       | `products`      |
| `collections/*`, `collection_listings/*` | `collections`   |

In Shopify admin, under **Settings > Notifications > Webhooks** (or in your app's configuration), subscribe the `products/create`, `products/update`, `products/delete` and matching `collections/*` topics to `https://<your-domain>/api/revalidate` in JSON format, and set `SHOPIFY_WEBHOOK_SECRET` to the signing secret shown there. A request with a missing or wrong signature gets `401`.

A tag names a kind of data, not one product, since a Page's Cache Strategy is the same for all its Params; an update re-renders every product page on its next request. Without a webhook, pages still refresh every 5 minutes. A stock change that Shopify reports only through `inventory_levels/*` is not mapped: availability on cached pages then follows that 5-minute window, while the cart and checkout always read live stock.

## For agents

| Surface                       | What it serves                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `/mcp`                        | MCP server (Streamable HTTP, stateless) with the tools below                                     |
| `/llms.txt`                   | The store, its collections, its products and how to shop it ([llmstxt.org](https://llmstxt.org)) |
| `/products/<handle>/index.md` | A product as Markdown, with its variant ids                                                      |
| Product pages                 | schema.org `Product` JSON-LD with an `AggregateOffer`                                            |

MCP tools. Each describes its result with an output schema, and the SDK validates the arguments of every tool that takes some:

- `search_products` — `{ query, limit? }`: matching products with handle, title, price and URL.
- `get_product` — `{ handle }`: description, options and variants with their ids.
- `list_collections` — collections with their URLs.
- `update_cart` — `{ cartId?, lines: [{ variantId, quantity }] }`: sets quantities (0 removes), creating a cart when there is no `cartId`. Returns the cart id and checkout URL.
- `get_cart` — `{ cartId }`.

Agents cannot pay: they hand the shopper the `checkoutUrl`.

### Connect Claude Code

With the dev server running:

```bash
claude mcp add --transport http ecoshop http://localhost:3000/mcp
```

Then ask, for example, "find a linen shirt in size M and put two in a cart". Use your deployed URL instead of `localhost` for a live store.

### Connect another MCP client

Any client that speaks Streamable HTTP can use the URL. A JSON client configuration usually looks like:

```json
{
	"mcpServers": {
		"ecoshop": { "type": "http", "url": "http://localhost:3000/mcp" }
	}
}
```

To explore the tools by hand, run `npx @modelcontextprotocol/inspector` and connect it to `http://localhost:3000/mcp` with the Streamable HTTP transport.

The endpoint refuses browser requests whose `Origin` is another site, so a web page cannot drive it through a visitor's browser. It has no authentication: every tool is either public catalog data or a cart reached by its id.

## Structure

- `src/lib/commerce/` — the `CommerceProvider` interface, the Shopify provider (GraphQL over `fetch`), the demo provider and its catalog, and provider selection
- `src/lib/cart/` — the cart cookie and the `/api/cart` handler
- `src/lib/mcp/` — the MCP server and its Streamable HTTP handler
- `src/lib/agents/` — `/llms.txt`, Markdown views and JSON-LD
- `src/lib/webhooks/` — webhook verification and tag mapping
- `src/pages/` — the home, `collections/[handle]`, `products/[handle]`, `search` and `cart` Pages, and the `api/cart`, `api/revalidate` and `mcp` Endpoints
- `src/components/add-to-cart/` — the product form and the `cart-form` host that enhances it
- `src/components/cart-count/` — the header cart link and its live count
- `app.ts` and `src/handlers/agents.server.ts` — the `/llms.txt` and Markdown routes, which end in a file extension and so are Explicit Routes
- `.agents/skills` — Ecopages, Radiant and Radiant UI skill packs; see [AGENTS.md](./AGENTS.md)

The demo cart keeps no server state: its id encodes its lines, so it survives restarts and works on serverless hosts. Each change returns a new id, which the cookie and MCP clients keep.

## Test and build

```bash
pnpm test        # providers, cart endpoint, webhook, agent documents and the MCP server over HTTP
pnpm typecheck
pnpm build
pnpm start       # builds, then serves pages, endpoints and the MCP server
```

`ecopages preview` serves only the static output, without endpoints; use `pnpm start` to try the cart and `/mcp` on a build. Rebrand by changing the seed colors at the top of `src/styles/tailwind.css` and the catalog in `src/lib/commerce/demo/catalog.ts`.

The storefront's agent surfaces were inspired by [vercel/shop](https://github.com/vercel/shop).

## Documentation

- [Ecopages documentation](https://ecopages.app)
- [Caching and revalidation](https://ecopages.app/docs/server/caching)
- [Endpoint files](https://ecopages.app/docs/server/endpoint-files)
- [Radiant UI documentation](https://radiant-ui.ecopages.app/docs)
- [Shopify Storefront API](https://shopify.dev/docs/api/storefront)
- [Model Context Protocol](https://modelcontextprotocol.io)
