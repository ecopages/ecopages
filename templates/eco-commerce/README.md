# Eco Commerce

A self-hosted storefront built with Ecopages. It owns its catalog and database: collections, categories, subcategories and products, with filters, product options, a server-side cart, a cart drawer, and tools that browser AI agents can call through WebMCP. Every page and form works without JavaScript.

It uses Ecopages JSX with Radiant hosts for the interactive parts, Radiant UI for the controls, Tailwind v4 on Lightning CSS, and Drizzle on libSQL for data. Pages and Endpoints reach the data only through a `CommerceBackend` interface, and agent tools go through those Endpoints, so the store can move to another database or an external commerce service without touching the UI. The catalog and its images are generated, so the template ships no database and no image files.

## Get started

Ecopages needs Node.js 24.22 or later on the 24 line, or Node.js 26 or later.

```sh
npx ecopages init my-store --template eco-commerce
cd my-store
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The first request creates the database at `.data/catalog.db` and seeds it.

## Scripts

| Script             | What it does                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `pnpm dev`         | Development server with hot reload.                                                         |
| `pnpm build`       | Builds the static pages and the server bundle into `dist/`, seeding the database if needed. |
| `pnpm start`       | Builds, then runs the production server. Set `CART_SECRET` first (see below).               |
| `pnpm test`        | Runs the Vitest unit tests in `src/`, including the `CommerceBackend` contract suite.       |
| `pnpm typecheck`   | Generates Ecopages types and runs `tsc`.                                                    |
| `pnpm db:generate` | Writes a Drizzle migration after you change `src/lib/commerce/drizzle/schema.ts`.           |

`ecopages preview` serves `dist/client` alone, without Endpoints or request-time Pages, so search, filters and the cart need `pnpm start`.

## Pages

| Route                                              | Rendered                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/`, `/collections/<c>`, `/collections/<c>/<cat>`  | At build (static). The home page links every subcategory of every collection.                                                  |
| `/collections/<c>/<cat>/<sub>`                     | At build: the first 24 products, filters, and a pager.                                                                         |
| `/collections/<c>/<cat>/<sub>/page/<n>`            | Later listing pages: the first ones at build, the rest on first request, then cached for an hour.                              |
| `/products/<slug>`                                 | The first products of each subcategory at build, the rest on first request, then cached for an hour (`cache: { revalidate }`). |
| `/search?q=&in=&material=&finish=&min=&max=&sort=` | Per request: search, filters and sort, all in the URL.                                                                         |
| `/order`                                           | Per request: the cart, with quantity and remove forms.                                                                         |

Endpoints live in `src/pages/**/*.api.ts`: `/api/products`, `/api/products/<slug>`, `/api/browse`, `/api/cart`, `/cart/add`, `/cart/update`, `/api/revalidate` and `/images/products/<slug>`.

### Why it is fast

- The browser router (`@ecopages/browser-router`) turns link clicks into client navigations and prefetches on hover and keyboard focus. Catalog links add `data-eco-prefetch="viewport"`, so the pages a visitor can see are fetched while the browser is idle; the home page alone holds a link per subcategory.
- Cards, typeahead rows and the product page use the same image URL, so the product image is already cached when its page opens. Images below the fold load lazily, and the catalog tree sections on the home and collection pages use `content-visibility: auto`, so the browser skips laying out sections nobody has scrolled to.
- Most of the page is server-rendered HTML. Scripts are split per Radiant host, and the cart drawer and "Recently viewed" load when the browser is idle.
- `POST /api/revalidate` drops cached pages by tag or path under `pnpm start`; `pnpm dev` has no page cache and answers `{"revalidated":false}`. It is off until you set `REVALIDATE_TOKEN`:

    ```sh
    curl -X POST http://localhost:3000/api/revalidate \
      -H "Authorization: Bearer $REVALIDATE_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"tags":["products"]}'
    ```

### Filters and sort

Subcategory and search pages share one GET form, `src/components/product-filters/`: material and finish checkboxes, a price range, and a sort. Without JavaScript the form submits to `/search`, so every filtered view is a plain URL a visitor can bookmark or share. With JavaScript, a change applies the filters at once through a client navigation.

## Backends

Pages and Endpoints import only `getCommerceBackend()` from `src/lib/commerce/index.server.ts`; agent tools run in the browser and call those Endpoints. It returns a `CommerceBackend` (`src/lib/commerce/backend.ts`) with two parts:

- `catalog`: the store tree, collection, category and subcategory pages, product listings with filters and facets, a product with its variants, related products, and the paths to prebuild.
- `cart`: read a cart, add a variant, and set a line's quantity (0 removes it). Each call takes the cart token from the cookie and returns the cart and, after a change, the token to store (or `null` when no cart exists, so the cookie stays as it is).

Every method is async and returns plain domain types from `src/lib/commerce/types.ts`, shaped like the Medusa store API (a product's `handle`, `variants`, `thumbnail`; money as an amount in cents and a currency code), so an adapter for an external service maps fields one to one. `src/lib/commerce/contract.fixture.ts` is a Vitest suite any adapter must pass; `src/lib/commerce/drizzle/adapter.contract.test.ts` runs it against the default adapter.

The default `drizzle` adapter in `src/lib/commerce/drizzle/` owns everything about the database: the schema, the client, the migrations, the seed, and the SQL, including the search `LIKE` patterns. An adapter for Medusa is planned.

### Connecting a database

`DATABASE_URL` picks the database. It defaults to a local libSQL file, `file:.data/catalog.db`; a relative `file:` path resolves against the app folder. A Turso database works as is: set `DATABASE_URL=libsql://<db>-<org>.turso.io` and `DATABASE_AUTH_TOKEN`. Migrations run on every start; an empty database, or one seeded with another `CATALOG_SIZE`, is seeded on start.

### Switch to Postgres

A dialect change stays inside `src/lib/commerce/drizzle/`. The files that change:

1. `schema.ts`: import `pgTable`, `integer`, `bigint`, `text`, `index` and `primaryKey` from `drizzle-orm/pg-core` instead of `drizzle-orm/sqlite-core`. `carts.updated_at` holds `Date.now()` milliseconds, which overflow a Postgres `integer`, so declare it `bigint('updated_at', { mode: 'number' })`.
2. `database.server.ts`: create the client with `drizzle-orm/node-postgres` (or `postgres-js`) and its migrator, and drop the local-file branch, which exists only for SQLite files.
3. `database.fixture.ts`: the tests open a temporary SQLite file through that branch; point them at a disposable Postgres database instead, for example a schema per test run.
4. `listing.server.ts`: the search and finish filters use `LIKE`, which SQLite matches without case and Postgres with case; use `ilike`.
5. `cart.server.ts`: the cart line upsert is raw SQL run with `db.run()` and reads `rowsAffected`. On node-postgres use `db.execute()` and `rowCount`, and spell the two-argument `min()` as `least()`.
6. `drizzle.config.ts`: set `dialect: 'postgresql'` and the connection URL.
7. Delete `src/lib/commerce/drizzle/migrations/` and run `pnpm db:generate`.

The storefront code, the pages and the tools stay as they are. Run `pnpm test` afterwards; the contract suite checks the adapter as a whole.

## The catalog generator

`src/lib/commerce/drizzle/seed/` builds the catalog from the taxonomy in `taxonomy.ts`: collections of categories of subcategories, and invented product names made of a model, a material and the subcategory's item ("Alder oak lounge chair"). Each product gets three finishes (its variants), a price, and sometimes a compare-at price with a "Sale" badge or a "New" badge. A seeded random generator draws all of it, so a size always yields the same rows, ids and handles.

`CATALOG_SIZE` picks a preset:

| Preset             | Collections | Subcategories | Products | Product pages at build |
| ------------------ | ----------- | ------------- | -------- | ---------------------- |
| `small`            | 3           | 27            | 108      | 108                    |
| `medium` (default) | 6           | 96            | 3,456    | 384                    |
| `large`            | 6           | 96            | 24,000   | 384                    |

`PREBUILT_PRODUCTS_PER_SUBCATEGORY` (default 4) and `PREBUILT_LISTING_PAGES` (default 2) set how much the build renders ahead; the rest renders on first request.

The database records the preset and the generator version. When either differs from what the app asks for, the next start regenerates the catalog and clears the carts. A local file is seeded into a temporary file that is renamed into place only once the seed succeeds, so a failed seed leaves nothing behind and a dev server and a build that start together never read a half-written catalog.

Product images come from `src/lib/images/placeholder.ts`, a few hundred bytes of SVG drawn from the product handle. To use real photos, replace `src/pages/images/products/[slug].api.ts` and `thumbnailUrl` in `src/lib/commerce/drizzle/mappers.ts`.

To use your own data, pass a `generate` function to `openCatalogDatabase` in `getCatalogDb` (`src/lib/commerce/drizzle/database.server.ts`) that returns your rows in the generator's shape, or write another adapter.

## The cart

The cart lives in the database: a `carts` row per visitor and a `cart_lines` row per product option. The cookie, `HttpOnly` and `SameSite=Lax`, holds only the cart id, signed with HMAC-SHA256; a cookie whose signature does not match reads as an empty cart. Each change is one operation on one line (add, set quantity, remove), applied in a single statement, so two tabs that change the cart at the same moment both keep their change. A cart holds up to 50 product options, checked by the database statement itself; adding a 51st is refused with the reason. A line holds up to 99: an addition that would go past it is capped at 99, and one to a line already at 99 is refused. Cart posts are refused unless the browser marks them `Sec-Fetch-Site: same-origin` (or `none`, as for a typed URL), so a post from another site, or a subdomain, never changes the cart. A request without the header, such as one from a script on the server, passes. Carts untouched for 30 days are removed. There are no accounts and no checkout.

- Without JavaScript, "Add to cart" is a form that posts the chosen finish and quantity to `/cart/add`, which answers with a redirect to `/order`. Quantities on `/order` are forms that post to `/cart/update`.
- With JavaScript, `<add-to-cart>` sends the same form with `fetch`, shows a toast, and updates the header count. The header cart link opens a drawer with the cart, where quantities change and lines go away without leaving the page.
- The product page lists related products and a "Recently viewed" strip, kept in the browser's `localStorage`.

## WebMCP

[WebMCP](https://webmachinelearning.github.io/webmcp/) lets a page offer tools to an AI agent running in the browser, so the agent calls a function instead of reading and clicking the page. This template follows the Draft Community Group Report of 24 November 2026 (commit `47e2b993ea9fd0599ffca3f58588eb3fd5f474f2`): tools are registered with `document.modelContext.registerTool()` and removed when their signal aborts. The declarative form annotations are only an explainer, not part of that spec, so the template does not use them.

Each tool is a method on a Radiant host, registered with `@agentTool` from `@ecopages/radiant/decorators/agent-tool`. Radiant registers it when the host connects and unregisters it when the host leaves the page, so the tools follow client navigations. The tool definitions, with their input schemas, are in `src/lib/webmcp/definitions.ts`; every tool that reads or changes data calls the same Endpoints the page uses, and invalid input returns an `error` that names the field.

| Tool               | Where                        | What it does                                                                 |
| ------------------ | ---------------------------- | ---------------------------------------------------------------------------- |
| `search_catalog`   | every page                   | Finds products by name.                                                      |
| `browse_store`     | every page                   | Lists collections, or the categories and subcategories of the current place. |
| `get_product`      | every page                   | Returns a product's details and variants.                                    |
| `open_product`     | every page                   | Shows a product's page and returns its details.                              |
| `get_cart`         | every page                   | Returns the cart.                                                            |
| `open_cart`        | every page                   | Opens the cart drawer.                                                       |
| `filter_products`  | subcategory and search pages | Applies filters and sort, as the visitor's form would.                       |
| `select_variant`   | product pages                | Selects a finish.                                                            |
| `add_to_cart`      | product pages                | Adds the product to the cart.                                                |
| `update_cart_line` | `/order`                     | Sets a line's quantity.                                                      |
| `remove_cart_line` | `/order`                     | Removes a line.                                                              |

Where `document.modelContext` is missing, no tool is registered and nothing is logged. The template bundles no polyfill.

### Try it

- Chrome 149 and Edge 150 ship WebMCP in an origin trial; for local testing, turn on `chrome://flags/#enable-webmcp-testing` and use an agent extension that reads `document.modelContext`.
- In other browsers, load [`@w3c/webmcp-polyfill`](https://www.npmjs.com/package/@w3c/webmcp-polyfill) before the page scripts, for example from a `<script>` in `src/includes/head.tsx`, and connect an agent that supports it.

## Environment

Copy `.env.example` to `.env`.

| Variable                            | Default                 | Purpose                                                                        |
| ----------------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `CART_SECRET`                       | development secret      | Signs the cart cookie. Required in production, at least 32 characters.         |
| `DATABASE_URL`                      | `file:.data/catalog.db` | libSQL URL: a local `file:` path or a remote `libsql://` database.             |
| `DATABASE_AUTH_TOKEN`               | unset                   | Token for a remote database such as Turso.                                     |
| `CATALOG_SIZE`                      | `medium`                | Catalog preset.                                                                |
| `PREBUILT_PRODUCTS_PER_SUBCATEGORY` | `4`                     | Product pages rendered at build per subcategory.                               |
| `PREBUILT_LISTING_PAGES`            | `2`                     | Listing pages rendered at build per subcategory.                               |
| `REVALIDATE_TOKEN`                  | unset                   | Enables `POST /api/revalidate`.                                                |
| `ECOPAGES_BASE_URL`                 | `http://localhost:3000` | Origin for canonical links; an `https:` origin marks the cart cookie `Secure`. |

## Structure

```
src/
├── components/       # Server components and Radiant hosts: product grid and filters, add-to-cart, cart drawer, search box, agent tools
├── includes/         # Html shell, head, SEO tags
├── layouts/          # Base layout: header, cart drawer, toaster, router script
├── lib/
│   ├── commerce/     # CommerceBackend interface, domain types, contract suite
│   │   └── drizzle/  # Default adapter: schema, client, migrations, seed, queries, cart
│   ├── storefront/   # URLs, listing query, JSON shapes, Endpoint logic, build policy
│   ├── webmcp/       # Agent tool definitions, input validation, tool actions
│   ├── browser/      # Client navigation and Endpoint calls
│   └── images/       # Placeholder SVG
├── pages/            # Pages and Endpoints (*.api.ts)
└── styles/           # Tailwind and Radiant UI theme
```

## Agent skills

[AGENTS.md](./AGENTS.md). Packs in this template:

- [Building with Ecopages](.agents/skills/ecopages/SKILL.md) ([hosted](https://ecopages.app/skill/SKILL.md))
- [Radiant reactive hosts](.agents/skills/radiant/SKILL.md) ([hosted](https://radiant.ecopages.app/skill/SKILL.md))
- [Building with Radiant UI](.agents/skills/radiant-ui/SKILL.md) ([hosted](https://radiant-ui.ecopages.app/skill/SKILL.md))

Index: [`.agents/README.md`](.agents/README.md).

## Credits

The dense, prefetched catalog idea comes from [NextFaster](https://github.com/ethanniser/NextFaster) (MIT). This template shares the idea, not its code, layout or content.
