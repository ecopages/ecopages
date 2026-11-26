# Vendored agent skills

Canonical copies of the [Radiant](https://radiant.ecopages.app/skill/SKILL.md) and [Radiant UI](https://radiant-ui.ecopages.app/skill/SKILL.md) skill packs. The Ecopages pack is copied from `apps/docs/src/public/skill`.

`pnpm sync:template-skills` writes these into each official template under `.agents/skills`. Refresh the Radiant packs from their hosted URLs when those sites publish a new skill revision.

`radiant/reference/agent-tools.md` and the agent-tools lines in `radiant/SKILL.md` (frontmatter description, the "When to use" bullet, two import-table rows and one reference-table row) are authored here, because the upstream Radiant pack does not cover agent tools yet. The `rui-table` line under "Multi-value `value`" in `radiant-ui/reference/forms.md` is corrected here too: upstream lists the table among the controls that dispatch `input` and `change`, but it keeps `rui-change`. Keep these on a refresh until the upstream packs carry them.
