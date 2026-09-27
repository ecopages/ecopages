# Agent skills

This app ships progressive skill packs for coding agents. Read the `SKILL.md` for the task, then one file in that pack's `reference/` directory.

| Pack | Local entry | Read when | Hosted copy |
| --- | --- | --- | --- |
| Building with Ecopages | [`skills/ecopages/SKILL.md`](./skills/ecopages/SKILL.md) | Pages, Layouts, Components, Integrations, Processors, eco.config.ts | [https://ecopages.app/skill/SKILL.md](https://ecopages.app/skill/SKILL.md) |
| Radiant reactive hosts | [`skills/radiant/SKILL.md`](./skills/radiant/SKILL.md) | RadiantElement, RadiantController, @prop, bindings, SSR | [https://radiant.ecopages.app/skill/SKILL.md](https://radiant.ecopages.app/skill/SKILL.md) |
| Radiant UI | [`skills/radiant-ui/SKILL.md`](./skills/radiant-ui/SKILL.md) | Rui* components, themes, semantic tokens | [https://radiant-ui.ecopages.app/skill/SKILL.md](https://radiant-ui.ecopages.app/skill/SKILL.md) |

Do not edit files under `skills/` by hand. In the Ecopages monorepo they are synced by `pnpm sync:template-skills`.
