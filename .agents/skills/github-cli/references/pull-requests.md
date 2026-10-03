# Pull requests

## Before opening

- Run [final-review](../../final-review/SKILL.md). Open the PR only on a `ready to ship` verdict.
- Write commit messages and the PR title with [commit-expert](../../commit-expert/SKILL.md).
- Write the release note the project requires for a user-facing change, such as a changeset, with [commit-expert](../../commit-expert/SKILL.md#release-notes).

## Split and stack

- **One PR per issue,** and one reviewable decision per PR.
- **Branch names** are kebab-case with a type prefix, such as `fix/stale-export-pages` or `refactor/extract-effect-registry`. Leave out internal ids such as audit numbers.
- **An independent PR** branches from the integration branch and targets it.
- **A dependent PR** stacks on the PR it needs: it branches from that PR's branch and targets it. Start its body with the stack note from the PR template.

## Open

1. Fill in `.github/pull_request_template.md` in a scratch file outside the tree. Keep its sections.
2. List each issue the PR resolves as `Closes #<n>`.
3. Ask the user, then push and open the PR:

```sh
git push -u origin <branch>
gh pr create --base <integration branch> --title "<commit-expert title>" --body-file <scratch>/pr.md
```

For a stacked PR, use `--base <previous branch>`.

## After opening

- **Base merged:** when a stacked PR's base merges, retarget it with `gh pr edit <n> --base <integration branch>`.
- **Updates:** edit the body with `gh pr edit <n> --body-file <scratch>/pr.md`.
- **Merge, only when asked,** with the method the project specifies: `gh pr merge <n> --squash` or `--merge`.
- **Close the issues.** `Closes #<n>` closes an issue only when the PR merges into the default branch. When it merged into another branch, close each issue yourself: `gh issue close <n> --comment "Fixed in #<pr>"`.
