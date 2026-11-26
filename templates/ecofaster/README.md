# Ecofaster

A product catalog built for speed with Ecopages: collections, categories, subcategories and products from SQLite, with static listing pages, search, and a cart that works with or without JavaScript.

It uses Ecopages JSX with Radiant hosts for the interactive parts, Radiant UI for the controls, Tailwind v4 on Lightning CSS, and Drizzle on libSQL for data. The catalog and its images are generated, so the template ships no database and no image files.

## Get started

Ecopages needs Node.js 24.22 or later on the 24 line, or Node.js 26 or later.

```sh
npx ecopages init my-catalog --template ecofaster
cd my-catalog
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The first request creates the database at `.data/catalog.db` and seeds it, which takes under a second for the default catalog.

## Scripts

| Script             | What it does                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `pnpm dev`         | Development server with hot reload.                                                         |
| `pnpm build`       | Builds the static pages and the server bundle into `dist/`, seeding the database if needed. |
| `pnpm start`       | Builds, then runs the production server. Set `CART_SECRET` first (see below).               |
| `pnpm test`        | Runs the Vitest unit tests in `src/`.                                                       |
| `pnpm typecheck`   | Generates Ecopages types and runs `tsc`.                                                    |
| `pnpm db:generate` | Writes a Drizzle migration into `drizzle/` after you change `src/lib/db/schema.ts`.         |

`ecopages preview` serves `dist/client` alone, without Endpoints or request-time Pages, so search and the cart need `pnpm start`.

## How it is fast

| Route                                                            | Rendered                                                                                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`, `/collections/...`                                          | At build, from `paths` and `props` (static).                                                                                                               |
| `/products/<slug>`                                               | At build for the first products of each subcategory, the rest on first request; then cached and regenerated after an hour (`cache: { revalidate, tags }`). |
| `/search?q=`, `/order`                                           | Per request (`cache: 'dynamic'`).                                                                                                                          |
| `/api/search`, `/api/cart`, `/cart/*`, `/images/products/<slug>` | Endpoints in `src/pages/**/*.api.ts`.                                                                                                                      |

- The browser router (`@ecopages/browser-router`) turns link clicks into client navigations and prefetches on hover and keyboard focus. Catalog links add `data-eco-prefetch="viewport"`, so the pages a visitor can see are fetched while the browser is idle.
- Cards, typeahead rows and the product page use the same image URL, so the product image is already cached when its page opens. Images below the fold load lazily; the first cards load eagerly.
- The header search downloads its scripts only on the first pointer or focus on it, keeps answers per query, and aborts a request when the visitor keeps typing.
- `POST /api/revalidate` drops cached product pages by tag or path under `pnpm start`; `pnpm dev` has no page cache and answers `{"revalidated":false}`. It is off until you set `REVALIDATE_TOKEN`:

    ```sh
    curl -X POST http://localhost:3000/api/revalidate \
      -H "Authorization: Bearer $REVALIDATE_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"tags":["products"]}'
    ```

## The catalog generator

`src/lib/catalog/generator.ts` builds the catalog from the taxonomy in `src/lib/catalog/taxonomy.ts`: six collections of four categories of four subcategories, and invented product names made of a model, a material and the subcategory's item ("Alder oak lounge chair"). A seeded random generator picks names, prices and descriptions, so a size always yields the same rows, ids and slugs.

`CATALOG_SIZE` picks a preset:

| Preset            | Collections | Products | Product pages built |
| ----------------- | ----------- | -------- | ------------------- |
| `small` (default) | 3           | 108      | all                 |
| `medium`          | 6           | 2,304    | 384                 |
| `large`           | 6           | 24,000   | 96                  |

The database records the preset and the generator version (`CATALOG_VERSION`). When either differs from what the app asks for, the next start regenerates the database. Seeding writes a temporary file and renames it into place, so a dev server and a build that start together never read a half-written catalog.

Product images come from `src/lib/images/placeholder.ts`, a few hundred bytes of SVG drawn from the product slug. To use real photos, replace `src/pages/images/products/[slug].api.ts` and `productImageUrl` in `src/lib/catalog/urls.ts`.

To use your own data, replace the generator call in `src/lib/db/catalog-database.server.ts` with an import from your source, or point `CATALOG_DB_PATH` at a database you fill yourself with the same schema. Such a database also needs the `catalog_meta` rows `size` (the `CATALOG_SIZE` preset) and `version` (`CATALOG_VERSION`); without them Ecofaster regenerates it and replaces the file.

## The cart

The cart is a list of product ids and quantities in an `HttpOnly`, `SameSite=Lax` cookie, signed with HMAC-SHA256. A cookie whose signature does not match reads as an empty cart. The signing key includes the catalog size and generator version, so regenerating the catalog empties existing carts instead of pointing their ids at other products. Cart posts a browser sends from another site (`Sec-Fetch-Site: cross-site`) are refused. A cart holds up to 50 products and 99 of each; an addition past that is refused with the reason. Because the whole cart lives in the cookie, two tabs that change it at the same moment each send the cart they started from, and the last response wins; a cart that must merge concurrent changes belongs in a server-side store. There are no accounts and no checkout.

- Without JavaScript, "Add to cart" is a form that posts to `/cart/add`, which answers with a redirect to `/order`. Quantities on `/order` are forms that post to `/cart/update`.
- With JavaScript, `<add-to-cart>` sends the same form with `fetch`; the header count moves at once and then takes the server's total.
- `<cart-link>` reads the count from `/api/cart` when the page loads and keeps it across client navigations.

## Environment

Copy `.env.example` to `.env`.

| Variable            | Default                 | Purpose                                                                        |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `CART_SECRET`       | development secret      | Signs the cart cookie. Required in production, at least 32 characters.         |
| `CATALOG_SIZE`      | `small`                 | Catalog preset.                                                                |
| `CATALOG_DB_PATH`   | `.data/catalog.db`      | Database file, relative to the app folder.                                     |
| `REVALIDATE_TOKEN`  | unset                   | Enables `POST /api/revalidate`.                                                |
| `ECOPAGES_BASE_URL` | `http://localhost:3000` | Origin for canonical links; an `https:` origin marks the cart cookie `Secure`. |

## Structure

```
src/
├── components/   # Product grid, breadcrumbs, and the add-to-cart, cart-link and search-box Radiant hosts
├── includes/     # Html shell, head, SEO tags
├── layouts/      # Base layout with the header and the router script
├── lib/
│   ├── catalog/  # Taxonomy, generator, queries, search, revalidation
│   ├── cart/     # Cart model, signed cookie, cart Endpoints' logic
│   ├── db/       # Drizzle schema and the database opener
│   └── images/   # Placeholder SVG
├── pages/        # Pages and Endpoints (*.api.ts)
└── styles/       # Tailwind and Radiant UI theme
drizzle/          # Migrations, applied when the database opens
```

## Agent skills

[AGENTS.md](./AGENTS.md). Packs in this template:

- [Building with Ecopages](.agents/skills/ecopages/SKILL.md) ([hosted](https://ecopages.app/skill/SKILL.md))
- [Radiant reactive hosts](.agents/skills/radiant/SKILL.md) ([hosted](https://radiant.ecopages.app/skill/SKILL.md))
- [Building with Radiant UI](.agents/skills/radiant-ui/SKILL.md) ([hosted](https://radiant-ui.ecopages.app/skill/SKILL.md))

Index: [`.agents/README.md`](.agents/README.md).

## Credits

Inspired by [NextFaster](https://github.com/ethanniser/NextFaster) (MIT), a demo of a large, fast catalog in Next.js. Ecofaster shares the idea, not its code, layout or content.
