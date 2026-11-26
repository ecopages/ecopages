# Agent instructions

Ecopages JSX storefront with Radiant, Radiant UI, Drizzle and libSQL.

- [Building with Ecopages](.agents/skills/ecopages/SKILL.md) — Pages, `paths` and `props`, Cache Strategy, Endpoints (`*.api.ts`), `.server` and `.script` files, `eco.config.ts`
- [Radiant reactive hosts](.agents/skills/radiant/SKILL.md) — `RadiantElement`, `@state`, `@bindTo`, `@onEvent`, `@agentTool`, render-owning hosts
- [Radiant UI](.agents/skills/radiant-ui/SKILL.md) — `Rui*` components, themes, semantic tokens
- Database and server code: `.agents/skills/ecopages/reference/server.md`, `.agents/skills/ecopages/reference/full-stack.md`

Hosted copies: [Ecopages](https://ecopages.app/skill/SKILL.md), [Radiant UI](https://radiant-ui.ecopages.app/skill/SKILL.md), [Radiant](https://radiant.ecopages.app/skill/SKILL.md).

- Pages and Endpoints reach data only through `getCommerceBackend()` from `src/lib/commerce/index.server.ts`; agent tools call those Endpoints. Only `src/lib/commerce/drizzle/` imports Drizzle, the schema or SQL; a new capability goes on the `CommerceBackend` interface first, with a case in `src/lib/commerce/contract.fixture.ts`.
- Browser Scripts (`*.script.ts`, `*.script.tsx`) import only browser-safe modules, never `*.server.ts`.
- Interactive behaviour is a Radiant host, and every form keeps working without JavaScript. Agent tools are `@agentTool` methods whose definitions live in `src/lib/webmcp/definitions.ts`; every tool that reads or changes data calls the same Endpoints the page uses.
- Limits shared by the adapter, the forms and the tools (cart size, quantity, search term length) live in `src/lib/limits.ts`; import them rather than writing the number again.
