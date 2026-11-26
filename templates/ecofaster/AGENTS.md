# Agent instructions

Ecopages JSX catalog app with Radiant, Radiant UI, Drizzle and SQLite.

- [Building with Ecopages](.agents/skills/ecopages/SKILL.md) — Pages, `paths` and `props`, Cache Strategy, Endpoints (`*.api.ts`), `.server` and `.script` files, `eco.config.ts`
- [Radiant reactive hosts](.agents/skills/radiant/SKILL.md) — `RadiantElement`, `@state`, `@bindTo`, `@onEvent`, render-owning hosts
- [Radiant UI](.agents/skills/radiant-ui/SKILL.md) — `Rui*` components, themes, semantic tokens
- Database and server code: `.agents/skills/ecopages/reference/server.md`, `.agents/skills/ecopages/reference/full-stack.md`

Hosted copies: [Ecopages](https://ecopages.app/skill/SKILL.md), [Radiant UI](https://radiant-ui.ecopages.app/skill/SKILL.md), [Radiant](https://radiant.ecopages.app/skill/SKILL.md).

Keep database access in `src/lib/**/*.server.ts` modules and call it from `paths`, `props` and Endpoint handlers. Browser Scripts (`*.script.ts`, `*.script.tsx`) import only browser-safe modules.
