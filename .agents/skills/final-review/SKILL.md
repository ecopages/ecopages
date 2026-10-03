---
name: final-review
description: Ship gate for a finished change. Runs the project's checks, then three parallel reviews (tests, code quality, documentation), fixes the easy findings once, re-checks, and ends with an explicit "ready to ship" or "not ready" verdict. Use for a final review, to ask whether work is ready to ship, to run the gates, or before committing or opening a pull request.
---

# Final review

The last gate before a commit or pull request. Run it end to end without asking; the user reads one verdict.

**Project specifics** (check commands, the base branch, release-note rules) come from the project's `AGENTS.md` and the project skill it names. If neither covers something, use the `package.json` scripts and the CI config.

## Scope

The change under review is all three of:

- the branch diff against its base: `git fetch`, then `git diff origin/<base>...HEAD`. The base is the project's integration branch, or, for a stacked PR, the branch below it;
- uncommitted changes, `git diff HEAD`;
- untracked files, `git ls-files --others --exclude-standard`.

## Flow

1. **Checks.** Run the project's local gate: lint, typecheck and tests (its pre-commit or fast CI gate, where it has one). Also run any slower suite, such as end-to-end tests or a drift check, whose area the change touches, as the project's docs describe. A red result means `not ready`: go to step 6. Do not format by hand; format-on-save and the hooks own formatting.

2. **Review in parallel.** In one message, launch three read-only subagents. Each prompt contains the scope above, the absolute path of the skill file to apply (resolve the links below against this skill's folder), and the return format below. Pass the path because a subagent cannot invoke `thermo-nuclear-code-quality-review` by name.

   | Reviewer | Skill | Also checks |
   |----------|-------|-------------|
   | Tests | [testing](../testing/SKILL.md) | |
   | Code quality | [thermo-nuclear-code-quality-review](../thermo-nuclear-code-quality-review/SKILL.md) | |
   | Docs | [senior-technical-writer](../senior-technical-writer/SKILL.md) | The project's comment rules (its `AGENTS.md` or style guide). Where a folder whose behaviour changed has a README, it and any index that lists it are updated. A user-facing change has the release note the project requires, such as a changeset. |

   Each reviewer returns a list of findings with `file`, `line`, `summary` and `class`:

   - `easy`: a fix inside the change that needs no design decision. Quick nits and a missing release note count.
   - `nit`: real, but not quick.
   - `rework`: touches files outside the change, needs a design decision, or changes behaviour.

3. **Fix once.** Apply every `easy` finding in one pass; write a missing release note with [commit-expert](../commit-expert/SKILL.md#release-notes). Do not commit.

4. **Re-check.** Run step 1 again, then re-run only the reviewers whose findings you fixed. There is no second fix round for these reviewers.

5. **Verdict.** End with exactly one of:

   - `ready to ship`: every check is green, no `easy` finding is left, and every `rework` finding is fixed or logged as an issue the user agreed to.
   - `not ready`: anything else.

   After the verdict, list what is left with `file:line` and the reason, rework first, then nits. Nits never block. Do not start rework unless asked.
