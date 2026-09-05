# Agent skills

Mirrored copies of the upstream skill packs for the two libraries this template
is built on. Point your coding agent at `.agents/skills/` — the directory is
agent-agnostic, and every pack follows the same shape: a `SKILL.md` entry with
YAML frontmatter, plus `reference/*.md` modules to read on demand.

| Pack                 | Source                                                               | Covers                                                                |
| -------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `skills/radiant-ui/` | [radiant-ui.ecopages.app](https://radiant-ui.ecopages.app/skill.txt) | Composing components, light-DOM contracts, themes and semantic tokens |
| `skills/radiant/`    | [radiant.ecopages.app](https://radiant.ecopages.app/skill.txt)       | Authoring your own `RadiantElement` / `RadiantController` hosts       |

The files are committed so a freshly initialized project works offline. They are
generated, not hand-maintained — send fixes upstream rather than editing here.

## Refreshing

```bash
pnpm run skills:sync                 # pull the current published packs
pnpm run skills:sync -- radiant-ui   # just one pack
pnpm run skills:sync -- --check      # exit non-zero if the copy has drifted
```

`scripts/sync-skills.ts` reads each site's `/skill.txt` index and follows the
`/skill/**` links it names, so a pack that gains a reference module upstream is
picked up without touching the script.

## Using them with Claude Code

Claude Code discovers skills under `.claude/skills/`. Symlink them in if you
want them loaded automatically:

```bash
mkdir -p .claude/skills
ln -s ../../.agents/skills/radiant .claude/skills/radiant
ln -s ../../.agents/skills/radiant-ui .claude/skills/radiant-ui
```

Otherwise, telling the agent to read `.agents/skills/radiant-ui/SKILL.md` before
touching UI code works just as well.
