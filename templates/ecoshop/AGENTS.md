# Agent instructions

Ecopages JSX storefront with Radiant UI, on the Shopify Storefront API or the bundled demo catalog.

- [Building with Ecopages](.agents/skills/ecopages/SKILL.md) — Pages, Layouts, Components, Endpoints, Cache Strategy, `eco.config.ts`
- [Radiant UI](.agents/skills/radiant-ui/SKILL.md) — `Rui*` components, themes, semantic tokens
- [Radiant reactive hosts](.agents/skills/radiant/SKILL.md) — `RadiantElement`, `@prop`, `@state`, `@bindTo`, `@onEvent`

Hosted copies: [Ecopages](https://ecopages.app/skill/SKILL.md), [Radiant UI](https://radiant-ui.ecopages.app/skill/SKILL.md), [Radiant](https://radiant.ecopages.app/skill/SKILL.md).

## Store rules

- Read commerce data only through `getCommerce()` (`src/lib/commerce/provider.server.ts`). Pages, `/api/cart`, `/llms.txt`, Markdown views and MCP tools share that one `CommerceProvider`; a new backend implements the interface in `src/lib/commerce/types.ts`.
- Keep secrets in `.server` modules. A browser script that reaches one fails the build.
- A catalog Page lists the tags of the data it renders in `cache: { revalidate, tags }`, from `src/lib/commerce/cache-tags.ts`. Pages that read the cart cookie or the Query are `cache: 'dynamic'`.
- Cart forms must work without JavaScript: they post to `/api/cart`, which redirects back. Wrap a form in `cart-form` to submit it in place.
- Build public URLs with `storePaths` (`src/lib/store-urls.ts`) so pages, JSON-LD, `/llms.txt` and MCP results agree.
- Run `pnpm test` and `pnpm typecheck` after a change. Shopify provider tests use recorded responses in `src/lib/commerce/shopify/__fixtures__`, never the network.
