# Ecoshop template

A Shopify storefront built with Ecopages JSX, [Radiant](https://radiant.ecopages.app) and [Radiant UI](https://radiant-ui.ecopages.app), made to be used by shoppers and by AI agents. Catalog pages are cached and revalidated by tag, the cart works without JavaScript, and agents can browse and fill a cart through WebMCP in the shopper's browser or through an MCP server.

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
| WebMCP, on every page         | The storefront tools, registered with `document.modelContext`, acting on the shopper's own cart  |
| `/mcp`                        | MCP server (Streamable HTTP, stateless) with the same tools, carts named by id                   |
| `/llms.txt`                   | The store, its collections, its products and how to shop it ([llmstxt.org](https://llmstxt.org)) |
| `/products/<handle>/index.md` | A product as Markdown, with its variant ids                                                      |
| `/policies/<handle>`          | Shipping, returns, privacy, terms and FAQ pages, which `ask_business` answers from               |
| Product pages                 | schema.org `Product` JSON-LD with an `AggregateOffer`                                            |

### The tools

One module, `src/lib/agents/store-tools.server.ts`, defines every tool: its name, description, input schema (Zod, served as JSON Schema) and what it runs against the `CommerceProvider`. WebMCP and `/mcp` both use it. The names and the input and output shapes follow the tools Shopify registers on its storefronts, so an agent that shops a Shopify store works here unchanged. Prices are `{ amount, currency, display }` with `amount` in minor units, as Shopify returns them.

| Tool                  | Page | `/mcp` | What it does                                                                                                                      |
| --------------------- | :--: | :----: | --------------------------------------------------------------------------------------------------------------------------------- |
| `search_catalog`      | yes  |  yes   | `{ catalog: { query, pagination? } }`: products, collections and policy pages, plus the search URL                                |
| `browse_store`        | yes  |  yes   | Lists collections, or a collection's products sorted and paged; `navigate` opens the page                                         |
| `get_product`         | yes  |  yes   | Variants, options, prices and available combinations; defaults to the product on the page                                         |
| `show_variant`        | yes  |   no   | Opens a product page with a variant selected, from an id or partial options                                                       |
| `get_cart`            | yes  |  yes   | The cart with its line ids and subtotal                                                                                           |
| `create_cart`         | yes  |  yes   | `{ cart: { line_items } }`: on a page, fills an empty cart and leaves a cart with items unchanged; over `/mcp`, starts a new cart |
| `update_cart`         | yes  |  yes   | Sets the cart to exactly the listed lines; refuses a stale cart revision or line id                                               |
| `cancel_cart`         | yes  |  yes   | Empties the cart; refuses a stale cart revision                                                                                   |
| `proceed_to_checkout` | yes  |  yes   | Opens the provider's checkout; over `/mcp` it returns the URL                                                                     |
| `ask_business`        | yes  |  yes   | `{ ask: { query } }`: answers from the store's policies and FAQ, with links                                                       |
| `add_to_cart`         | yes  |   no   | Product pages only: adds a variant of that product to the cart                                                                    |

Over `/mcp` there is no shopper session, so `get_cart`, `update_cart`, `cancel_cart` and `proceed_to_checkout` take the cart `id` that `create_cart` returned. On a page they act on the shopper's cart. There the `id` a cart result carries is a revision of its lines, not the cart id, which grants access to the cart and stays in the `HttpOnly` cookie: an `update_cart` or `cancel_cart` call with an older revision changes nothing. Agents cannot pay: checkout is the provider's page, where the shopper confirms.

### WebMCP

[WebMCP](https://webmachinelearning.github.io/webmcp) lets a page offer tools to an agent running in the visitor's browser, so the agent acts in the visitor's session and the visible page instead of clicking through the DOM. This template follows the W3C Web Machine Learning Community Group draft at [webmachinelearning/webmcp@47e2b99](https://github.com/webmachinelearning/webmcp/tree/47e2b993ea9fd0599ffca3f58588eb3fd5f474f2) (2026-11-24): the entry point is `document.modelContext`, a tool is registered with `registerTool(tool, { signal })` and removed when its signal aborts.

- **Registration.** Radiant hosts own the tools, through `createAgentTool` from `@ecopages/radiant`: `<store-agent-tools>` in the layout registers the storefront set and persists across client navigations, and the product form's `<cart-form>` registers `add_to_cart` while it is on the page. A client navigation away from a product page unregisters `add_to_cart`.
- **Execution.** Each call runs on the server through `POST /api/agent-tools/<name>`, which validates the input against the shared schema, uses the cart cookie and the same provider as the pages. Input that fails the schema returns a tool error naming the field and changes nothing. A cart change updates the header count and shows a toast before the tool returns.
- **Result size.** `search_catalog`, `get_product` and a full `browse_store` page can return more than the 1,500 characters Chrome recommends for a tool result, as Shopify's tools do; Radiant logs a warning once in development.
- **Feature detection.** Where `document.modelContext` is missing nothing happens: no request, no registration, no log. No polyfill is bundled. To try the tools in a browser without WebMCP, load the [`@w3c/webmcp-polyfill`](https://www.npmjs.com/package/@w3c/webmcp-polyfill) in a local script, or inspect them with an extension that implements `document.modelContext`.
- **Browser support** (November 2026): an origin trial in Chrome 149 and Edge 150, and `chrome://flags/#enable-webmcp-testing` for local development. Firefox and Safari have open standards positions. See the [implementation status](https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md).
- **Declarative forms.** The form attributes (`toolname`, `tooldescription`) are a separate explainer and are not in the specification draft above, so the template does not use them.

#### Differences from Shopify's storefront tools

The tool set was compared on 2026-11-26 with [Shopify's WebMCP documentation](https://shopify.dev/docs/api/web-mcp) and with the tools a live Liquid storefront registers. The descriptions are this template's own.

- `manage_orders` is not offered: the template has no customer accounts.
- `get_ucp_profile` is not offered: the template serves no `/.well-known/ucp` profile.
- The checkout tools (`get_checkout`, `update_checkout`, `complete_checkout`, `navigate_checkout`, `navigate_to_storefront`) are registered by Shopify's own checkout pages, which a connected store's `proceed_to_checkout` opens. The demo checkout has none.
- `search_catalog` returns no articles, since the template has no blog; its `pages` are the policy pages.
- `ask_business` answers from the store's policies: with a Shopify store, the refund, shipping, privacy and terms policies the Storefront API publishes; the demo catalog also has an FAQ. Shopify's own tool also reads FAQ pages and its Ask knowledge base. It accepts `ask.context` and does not use it.
- `browse_store` sorts by price or title. `best-selling` keeps the provider's order: Shopify's best-selling order for `all`, and the collection's own order for a collection. It has no creation-date sort, and it sorts and pages the first 250 products of a collection.
- The stale-cart check runs before the change: a shopper edit that lands between the check and the write is overwritten, since neither the Storefront API nor the demo cart offers a conditional write.
- `get_cart`, `cancel_cart` and `proceed_to_checkout` accept an optional `id`, which `/mcp` needs. The cart totals have a subtotal and no total, since shipping and taxes are set at checkout.
- `add_to_cart` is an addition for product pages.
- Shopify does not publish its tool definitions as a package that a headless storefront could install, so they are defined here, against the `CommerceProvider`, which also lets them run on the demo catalog.

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

## Interface

Interactive behaviour lives in Radiant hosts (`cart-form`, `cart-count`, `store-agent-tools`, `theme-toggle`). The UI uses Radiant UI's button, input, badge, alert, radio group (variant picker), carousel (product images), disclosure (shipping and returns), breadcrumb, chip (tags), toast (cart feedback) and cycle toggle. Two places keep native controls on purpose, because the cart must work without JavaScript:

- The quantity is a native number input: Radiant UI's number field names its input only once its script runs, so a post without JavaScript would lose the quantity.
- The variant picker carries a hidden default `variantId`: the radio group's host checks the selected radio only once its script runs.

## Structure

- `src/lib/commerce/` — the `CommerceProvider` interface, the Shopify provider (GraphQL over `fetch`), the demo provider and its catalog, and provider selection
- `src/lib/cart/` — the cart cookie and the `/api/cart` handler
- `src/lib/agents/` — the shared tool definitions, the `/api/agent-tools` handler, the browser tool client, `/llms.txt`, Markdown views and JSON-LD
- `src/lib/mcp/` — the MCP server and its Streamable HTTP handler
- `src/lib/webhooks/` — webhook verification and tag mapping
- `src/pages/` — the home, `collections/[handle]`, `products/[handle]`, `policies/[handle]`, `search` and `cart` Pages, and the `api/cart`, `api/agent-tools`, `api/revalidate` and `mcp` Endpoints
- `src/components/add-to-cart/` — the product form and the `cart-form` host that enhances it and registers `add_to_cart`
- `src/components/agent-tools/` — the `<store-agent-tools>` host that registers the storefront tools
- `src/components/cart-count/` — the header cart link and its live count
- `app.ts` and `src/handlers/agents.server.ts` — the `/llms.txt` and Markdown routes, which end in a file extension and so are Explicit Routes
- `.agents/skills` — Ecopages, Radiant and Radiant UI skill packs; see [AGENTS.md](./AGENTS.md)

The demo cart keeps no server state: its id encodes its lines, so it survives restarts and works on serverless hosts. Each change returns a new id, which the cookie and MCP clients keep.

## Test and build

```bash
pnpm test        # providers, cart endpoint, webhook, tools, agent documents and the MCP server over HTTP
pnpm typecheck
pnpm build
pnpm start       # builds, then serves pages, endpoints and the MCP server
```

`ecopages preview` serves only the static output, without endpoints; use `pnpm start` to try the cart and `/mcp` on a build. Rebrand by changing the seed colors at the top of `src/styles/tailwind.css` and the catalog in `src/lib/commerce/demo/catalog.ts`.

In the Ecopages repository, the `template-ecoshop-dev-e2e` Playwright project covers the WebMCP tools end to end with a stand-in `document.modelContext`, and the cart without JavaScript.

The storefront's agent surfaces were inspired by [vercel/shop](https://github.com/vercel/shop).

## Documentation

- [Ecopages documentation](https://ecopages.app)
- [Caching and revalidation](https://ecopages.app/docs/server/caching)
- [Endpoint files](https://ecopages.app/docs/server/endpoint-files)
- [Radiant UI documentation](https://radiant-ui.ecopages.app/docs)
- [Shopify Storefront API](https://shopify.dev/docs/api/storefront)
- [Model Context Protocol](https://modelcontextprotocol.io)
