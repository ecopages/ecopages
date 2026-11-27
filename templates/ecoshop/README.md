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

Setting the quantities of an existing cart (the cart page, `update_cart`, `cancel_cart`) reads the cart and the stock of the variants it keeps in one request, refuses a sold-out variant before writing, then writes the additions, and the updates and removals together, in one request each. Shopify runs every field of a mutation even after one fails, so the additions go first and alone: a refused addition changes nothing. Any addition Shopify accepts but holds none of, because of a stock warning, is refused.

The Storefront API has no transaction and no conditional write, so two things can still happen between the read and the writes, and the provider answers both. A change from another tab can push a line past the 99-unit cap (two tabs that each add one unit to a line of 98): the cart a write returns is checked again and an over-cap line is set back to 99, with a warning message in the result. When the second write is refused after the additions went through, the cart is read again and returned as it now is, with an error message that names the refusal, so the agent and the shopper see what the cart holds instead of an error that hides the additions. The messages are `Cart.messages` of the provider's result, which the agent tools return as `messages`.

## Revalidation webhook

Catalog pages use `cache: { revalidate: 300, tags }`: the home and collection pages carry the `products` and `collections` tags, product pages `products`, and policy pages `policies`. `POST /api/revalidate` verifies Shopify's `X-Shopify-Hmac-Sha256` signature and invalidates the tags for the topic:

| Topics                                    | Tag invalidated           |
| ----------------------------------------- | ------------------------- |
| `products/*`, `product_listings/*`        | `products`                |
| `inventory_levels/*`, `inventory_items/*` | `products`                |
| `collections/*`, `collection_listings/*`  | `collections`             |
| `shop/update`                             | `collections`, `policies` |

In Shopify admin, under **Settings > Notifications > Webhooks** (or in your app's configuration), subscribe the `products/*`, `collections/*`, `inventory_levels/update` and `shop/update` topics to `https://<your-domain>/api/revalidate` in JSON format, and set `SHOPIFY_WEBHOOK_SECRET` to the signing secret shown there. A request with a missing or wrong signature gets `401`.

A tag names a kind of data, not one product, since a Page's Cache Strategy is the same for all its Params; an update re-renders every product page on its next request. A stock change names an inventory item, not a product, so it re-renders every product page too. Shopify sends no webhook for a policy edit: `shop/update`, sent when the shop's settings change, re-renders the policy pages and the home page, and an edited policy otherwise shows within 5 minutes. Without a webhook, pages still refresh every 5 minutes.

## For agents

| Surface                            | What it serves                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| WebMCP, on every page              | The storefront tools, registered with `document.modelContext`, acting on the shopper's own cart  |
| `/mcp`                             | MCP server (Streamable HTTP, stateless) with the same tools, carts named by id                   |
| `/.well-known/ucp`, `/api/ucp/mcp` | The connected Shopify store's UCP profile and endpoint, forwarded (a Shopify store only)         |
| `/llms.txt`                        | The store, its collections, its products and how to shop it ([llmstxt.org](https://llmstxt.org)) |
| `/products/<handle>/index.md`      | A product as Markdown, with its variant ids                                                      |
| `/policies/<handle>`               | Shipping, returns, privacy, terms and FAQ pages, which `ask_business` answers from               |
| Product pages                      | schema.org `Product` JSON-LD with an `AggregateOffer`                                            |

### The tools

One module, `src/lib/agents/store-tool-definitions.ts`, defines every tool: its name, description, annotations and input schema (`zod/mini`, served as JSON Schema); `store-tools.server.ts` adds what each runs against the `CommerceProvider`. WebMCP and `/mcp` both use the definitions, and the browser bundles them. The names and the input and output shapes follow the tools Shopify registers on its storefronts, so an agent that shops a Shopify store works here unchanged. Prices are `{ amount, currency, display }` with `amount` in minor units, as Shopify returns them.

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
| `get_ucp_profile`     | yes  |   no   | A connected Shopify store only: the store's UCP profile (see below)                                                               |

Over `/mcp` there is no shopper session, so `get_cart`, `update_cart`, `cancel_cart` and `proceed_to_checkout` take the cart `id` that `create_cart` returned. On a page they act on the shopper's cart. There the `id` a cart result carries is a revision of its lines, not the cart id, which grants access to the cart and stays in the `HttpOnly` cookie: an `update_cart` or `cancel_cart` call with an older revision changes nothing. Agents cannot pay: checkout is the provider's page, where the shopper confirms.

### WebMCP

[WebMCP](https://webmachinelearning.github.io/webmcp) lets a page offer tools to an agent running in the visitor's browser, so the agent acts in the visitor's session and the visible page instead of clicking through the DOM. This template follows the W3C Web Machine Learning Community Group draft at [webmachinelearning/webmcp@47e2b99](https://github.com/webmachinelearning/webmcp/tree/47e2b993ea9fd0599ffca3f58588eb3fd5f474f2) (2026-11-24): the entry point is `document.modelContext`, a tool is registered with `registerTool(tool, { signal })` and removed when its signal aborts.

- **Registration.** Each tool is a method on the Radiant host that owns its behavior, decorated with `@agentTool(agentToolConfig(<definition>))` from `@ecopages/radiant/decorators/agent-tool`, so Radiant registers it while the host is connected and removes it when the host goes. `<cart-form>` (the product form) has `add_to_cart` and `show_variant`; the add button calls the same `add` method, and `show_variant` selects the variant in the picker through the same `selectVariant` a `?variant=` link uses. `<cart-count>` (the header cart link, persisted across client navigations) has `get_cart`, `update_cart`, `cancel_cart` and `proceed_to_checkout`. `<store-agent-tools>` (in the layout, persisted) has `search_catalog`, `browse_store`, `get_product`, `ask_business` and `create_cart`. A client navigation away from a product page unregisters `add_to_cart` and `show_variant`. The cart page's forms are plain forms that post to `/api/cart`, so no UI method stands behind the cart tools; they run on the server and update the page.
- **Execution.** A host's method parses the input with the definition's schema before it runs, so invalid input is refused in the browser with a message naming the field and nothing is sent. It then calls `POST /api/agent-tools/<name>`, which validates the input again (a request can skip the browser), uses the cart cookie and the same provider as the pages. A cart change updates the header count and shows a toast before the tool returns. A tool that opens a page of the store (`browse_store`, `get_product` with `navigate`, `proceed_to_checkout`) returns its result first, then opens the page through the browser router, so the persisted hosts stay connected; the cart page fetches fresh after a cart change.
- **Bundle.** The definitions are bundled, not fetched: there is no tool-list request. They use `zod/mini`, whose Zod chunk is 14 kB gzipped in a built store (26 kB with classic Zod). Every visitor downloads it, WebMCP or not, because `@agentTool` reads `inputSchema` and `parse` when the element is constructed, before a dynamic import could resolve. Hosts that wanted the chunk only for WebMCP browsers would have to register their tools with `createAgentTool` after an `import()`, which gives up the shared UI and agent method.
- **Result size.** Chrome recommends tool results of at most 1,500 characters, and Radiant warns once in development when a result is longer. On a page, `search_catalog`, `get_product`, `browse_store` and `ask_business` return a compact shape: per product its title, handle, `variant_id`, URL and price, and per variant its id, title and price. `search_catalog` and `get_product` drop the items that do not fit and say how many (`products_not_shown`, `variants_not_shown`); `browse_store` lists four products a page and reports `total_products` and `has_more`. Over `/mcp` the results keep the full Shopify shape. A cart result carries a line per item, so a cart with many lines still exceeds the recommendation.
- **Feature detection.** Radiant registers a tool only where `document.modelContext` exists. Without it nothing happens: no request, no registration, no log. No polyfill is bundled. A polyfill or extension that installs `document.modelContext` after the host connected is seen when the page finishes loading and each time it is shown or focused again (`src/lib/agents/model-context.ts`): the polyfill fires no event of its own and the template never polls. Load the polyfill before the page's own scripts, or before the `load` event, so the tools register at once. To try the tools in a browser without WebMCP, load the [`@w3c/webmcp-polyfill`](https://www.npmjs.com/package/@w3c/webmcp-polyfill) in a local script, or inspect them with an extension that implements `document.modelContext`.
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

### UCP

Shopify serves the [Universal Commerce Protocol](https://shopify.dev/docs/agents/catalog/storefront-mcp) (UCP) from every storefront: a profile at `/.well-known/ucp` and an MCP endpoint at `/api/ucp/mcp` for catalog, cart and checkout. A UCP client expects those, so this template forwards them rather than reimplementing UCP over its own tools, whose names and shapes follow Shopify's WebMCP tools.

- **With Shopify credentials set,** `/.well-known/ucp` serves the connected store's profile with its `/api/ucp/mcp` URL replaced by this site's, and `POST /api/ucp/mcp` forwards the client's JSON-RPC request to the store's own endpoint and returns the answer unchanged. The client sends its own `meta.ucp-agent.profile`, as the store requires; nothing is added. The destination is fixed to the connected store, a foreign `Origin` is refused, and a body over 256 kB is refused. Pages register `get_ucp_profile` with WebMCP, which returns that same profile.
- **On the demo catalog,** there is no store to forward to: both URLs answer 404, `get_ucp_profile` is not registered, and the `/mcp` server above is the agent surface.

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
- `src/lib/agents/` — the shared tool definitions and what they run, the `/api/agent-tools` handler, the browser tool client, `/llms.txt`, Markdown views and JSON-LD
- `src/lib/mcp/` — the MCP server and its Streamable HTTP handler
- `src/lib/ucp/` — the forwarded UCP profile and endpoint of a connected Shopify store
- `src/lib/webhooks/` — webhook verification and tag mapping
- `src/pages/` — the home, `collections/[handle]`, `products/[handle]`, `policies/[handle]`, `search` and `cart` Pages, and the `api/cart`, `api/agent-tools`, `api/revalidate` and `mcp` Endpoints
- `src/components/add-to-cart/` — the product form and the `cart-form` host that enhances it and owns `add_to_cart` and `show_variant`
- `src/components/agent-tools/` — the `<store-agent-tools>` host that owns the catalog and store tools
- `src/components/cart-count/` — the header cart link, its live count and the cart tools
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

In the Ecopages repository, the `template-ecoshop-dev-e2e` Playwright project covers the WebMCP tools end to end with a stand-in `document.modelContext`, and the cart without JavaScript; `template-ecoshop-start-e2e` requests `/llms.txt`, `/api/cart`, `/mcp` and a signed `/api/revalidate` from a built store.

The storefront's agent surfaces were inspired by [vercel/shop](https://github.com/vercel/shop).

## Documentation

- [Ecopages documentation](https://ecopages.app)
- [Caching and revalidation](https://ecopages.app/docs/server/caching)
- [Endpoint files](https://ecopages.app/docs/server/endpoint-files)
- [Radiant UI documentation](https://radiant-ui.ecopages.app/docs)
- [Shopify Storefront API](https://shopify.dev/docs/api/storefront)
- [Model Context Protocol](https://modelcontextprotocol.io)
