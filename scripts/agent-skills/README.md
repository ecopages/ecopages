# Vendored agent skills

Canonical copies of the [Radiant](https://radiant.ecopages.app/skill/SKILL.md) and [Radiant UI](https://radiant-ui.ecopages.app/skill/SKILL.md) skill packs. The Ecopages pack is copied from `apps/docs/src/public/skill`.

`pnpm sync:template-skills` writes these into each official template under `.agents/skills`. Refresh the Radiant packs from `apps/docs/src/public/skill` and `apps/radiant-ui/src/public/skill` in the Radiant repository (or their hosted URLs) when it publishes a new skill revision, and copy them as they are: the packs carry no local edits.
