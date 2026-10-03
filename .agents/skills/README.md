# Contributor agent skills

Skills for agents working on this repository. This folder is the only committed copy.

Run `pnpm init:dev` once after cloning. It links each skill into `.claude/skills` and `.cursor/skills`, which are gitignored. The generic skills work in any repository; to use them everywhere, also link them into your personal skills folder:

```sh
pnpm init:dev -- ~/.claude/skills
```

- A directory or link that already has a skill's name is skipped (printed as `[skip]`), never replaced. In Claude Code a personal skill wins over a project skill with the same name, so remove an older personal copy before linking.
- Links to skills removed from this folder are pruned.
- Project skills are linked only inside this repository.

These are not the skills shipped to Ecopages users. The user-facing skill lives in `apps/docs/src/public/skill`, and template skill packs are synced by `pnpm sync:template-skills` (see `scripts/agent-skills/README.md`).

## Skills

| Skill | Kind | Use | Source |
| --- | --- | --- | --- |
| [final-review](final-review/SKILL.md) | generic | Ship gate: checks, three parallel reviews, one fix round, a ready or not-ready verdict | Ecopages maintainers |
| [github-cli](github-cli/SKILL.md) | generic | Issues from validated draft files, pull requests, stacks, checks and reviews through `gh` and the `.github` schema | Ecopages maintainers |
| [architecture-review](architecture-review/SKILL.md) | generic | Audit an area under `.audit/`, turn findings into issues, execute them | Ecopages maintainers |
| [testing](testing/SKILL.md) | generic | Choosing a test layer and writing tests that can fail | Ecopages maintainers |
| [commit-expert](commit-expert/SKILL.md) | generic | Commit messages, PR titles, changelog lines, changesets | Ecopages maintainers |
| [senior-technical-writer](senior-technical-writer/SKILL.md) | generic | Writing and reviewing docs against the code; a final-review reviewer | Ecopages maintainers |
| [thermo-nuclear-code-quality-review](thermo-nuclear-code-quality-review/SKILL.md) | generic | Strict maintainability review; a final-review reviewer | [Cursor](https://github.com/cursor/plugins), MIT, kept as published |
| [ecopages](ecopages/SKILL.md) | project | Where this repository keeps its checks, CI, test setup, releases and conventions | Ecopages maintainers |

## Generic and project skills

- **Generic skills** name no repository, command or path. For those they defer to the project's `AGENTS.md` and the project skill it names. They link only to other skills, so the links still resolve from a personal skills folder.
- **The project skill** maps each need to the file in this repository that holds the truth. It makes no claims of its own, so nothing in it can go stale or bias a decision about the framework. It sets `metadata.scope: project`, which keeps `pnpm init:dev` from linking it outside the repository.

## Layout

Every skill uses progressive disclosure, so an agent loads only what the task needs:

| Path | Holds | Loaded |
| --- | --- | --- |
| `SKILL.md` | When to use the skill, its hard rules, and a table mapping each task to a reference or script. Keep it short. | When the skill triggers |
| `references/*.md` | Detail for one task: formats, procedures, patterns | When the routing table points at it |
| `scripts/*` | Deterministic steps: validation, creation, anything that must come out the same every time | Run, not read. Never reimplement a script's job by hand. |
| `assets/*` | Files to copy and fill in (templates) | When producing that file |

**Rules for new skills:**

- **Generic first.** Write the skill for any repository. A fact about this repository goes in the project skill, as a pointer to the file that holds it.
- **Script it.** If two agents could do a step differently, write a script and make `SKILL.md` say to run it.
- **Schemas live in the repository, not in skills.** Issue forms, labels and the PR template are in `.github/`. Skills read them; they do not restate them.
- **Link, don't copy.** Skills link to each other with relative paths (`../final-review/SKILL.md`).
- **Vendored skills** stay as published, with their license and a `metadata.source` link.
