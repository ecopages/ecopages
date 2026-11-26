# Vendored agent skills

Canonical copies of the [Radiant](https://radiant.ecopages.app/skill/SKILL.md) and [Radiant UI](https://radiant-ui.ecopages.app/skill/SKILL.md) skill packs. The Ecopages pack is copied from `apps/docs/src/public/skill`.

`pnpm sync:template-skills` writes these into each official template under `.agents/skills`. Refresh the Radiant packs from their hosted URLs when those sites publish a new skill revision.

`radiant/reference/agent-tools.md` and the agent-tools lines in `radiant/SKILL.md` (frontmatter description, the "When to use" bullet, two import-table rows and one reference-table row) are authored here, because the upstream Radiant pack does not cover agent tools yet. Keep them on a refresh until the upstream pack does.
