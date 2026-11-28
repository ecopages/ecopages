# Agent instructions

Ecopages JSX storefront with Radiant UI, on the Shopify Storefront API or the bundled demo catalog.

- [Building with Ecopages](.agents/skills/ecopages/SKILL.md) — Pages, Layouts, Components, Endpoints, Cache Strategy, `eco.config.ts`
- [Radiant UI](.agents/skills/radiant-ui/SKILL.md) — `Rui*` components, themes, semantic tokens
- [Radiant reactive hosts](.agents/skills/radiant/SKILL.md) — `RadiantElement`, `@prop`, `@state`, `@bindTo`, `@onEvent`, agent tools (`createAgentTool`, `@agentTool`)

Hosted copies: [Ecopages](https://ecopages.app/skill/SKILL.md), [Radiant UI](https://radiant-ui.ecopages.app/skill/SKILL.md), [Radiant](https://radiant.ecopages.app/skill/SKILL.md).

## Store rules

- Read commerce data only through `getCommerce()` (`src/lib/commerce/provider.server.ts`). Pages, `/api/cart`, `/api/agent-tools`, `/llms.txt`, Markdown views and MCP tools share that one `CommerceProvider`; a new backend implements the interface in `src/lib/commerce/types.ts`.
- Keep secrets in `.server` modules. A browser script that reaches one fails the build.
- A catalog Page lists the tags of the data it renders in `cache: { revalidate, tags }`, from `src/lib/commerce/cache-tags.ts`. Pages that read the cart cookie or the Query are `cache: 'dynamic'`.
- Cart forms must work without JavaScript: they post to `/api/cart`, which redirects back. The product form's `cart-form` host submits it in place through the `add_to_cart` tool, so it belongs to a form that adds one variant.
- Define agent tools once: name, description and annotations in `src/lib/agents/store-tool-info.ts`, the input schema on top of them in `store-tool-definitions.ts` (what a tool runs is in `store-tools.server.ts`): `/mcp` and the WebMCP tools both read them. A host imports `store-tool-info.ts`, and `agentToolConfig` and `ToolInputOf` from `agent-tool-config.ts`; nothing a browser loads imports the values of `store-tool-definitions.ts`, which would put the Zod chunk in every visitor's bundle. After you change a schema or a tool's name, run `pnpm schemas` to write `store-tool-schemas.ts`, the static JSON Schema the hosts hand to WebMCP; `store-tool-schemas.test.ts` fails when it differs. Keep Shopify's storefront tool names and shapes, and list any deviation in the README.
- Register WebMCP tools as `@agentTool(agentToolConfig(<info>))` methods on the Radiant host that owns the behavior, so the UI and the agent call the same method and connect and disconnect drive registration. Use `createAgentTool` only for a tool that is not one method. Never call `document.modelContext.registerTool` yourself or fetch a tool list: Radiant registers only where `document.modelContext` exists, and the definitions are bundled. Radiant 0.14 reads the config as plain values: `inputSchema` is a static object, not a function or a promise, and no field is a getter. The config leaves out `parse`, since a Zod `parse` would ship Zod. Run tools through `/api/agent-tools`, which validates the input with Zod and answers invalid input with a tool error naming the field.
- Build public URLs with `storePaths` (`src/lib/store-urls.ts`) so pages, JSON-LD, `/llms.txt` and MCP results agree.
- Run `pnpm test` and `pnpm typecheck` after a change. Shopify provider tests use recorded responses in `src/lib/commerce/shopify/__fixtures__`, never the network.
