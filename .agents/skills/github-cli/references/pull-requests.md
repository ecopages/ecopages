# Pull requests

## Before opening

- Run [final-review](../../final-review/SKILL.md). Open the PR only on a `ready to ship` verdict.
- Write commit messages and the PR title with [commit-expert](../../commit-expert/SKILL.md).
- Write the release note the project requires for a user-facing change, such as a changeset, with [commit-expert](../../commit-expert/SKILL.md#release-notes).

## Split and stack

- **One PR per issue,** and one reviewable decision per PR.
- **Branch names** are kebab-case with a type prefix, such as `fix/stale-export-pages` or `refactor/extract-effect-registry`. Leave out internal ids such as audit numbers.
- **An independent PR** branches from the integration branch and targets it.
- **A dependent PR** joins a stack on the PR it needs, as [Stacks](#stacks) shows. "Blocked by" between two issues means exactly this: while the blocker's PR is open, the blocked issue's PR stacks on it. A blocker without a PR, such as an unanswered decision, is not a stack: wait for it.
- **Splitting finished work** into several PRs: commit everything to a local backup branch, build each branch from it with `git checkout <backup> -- <paths>`, confirm with `git diff <top branch> <backup>` that nothing is lost, then delete the backup.

## Stacks

Stacks are GitHub stacked pull requests, managed with the [gh-stack](https://github.com/github/gh-stack) extension (`gh extension install github/gh-stack` when `gh stack` is missing). The trunk is the integration branch. `gh stack submit` and `gh stack modify` open an interactive editor, so an agent opens the PRs itself:

```sh
gh stack init --base <integration branch> <bottom> <next> <top>   # create or adopt the branches, bottom to top
gh stack bottom                                                   # commit each layer on its own branch; move with up, down, top
gh stack push                                                     # push every branch
gh pr create --head <branch> --base <branch below> --title "<commit-expert title>" --body-file <scratch>/pr.md
gh stack sync                                                     # link the open PRs into one stack on GitHub
```

- **Open bottom up.** The bottom PR targets the integration branch. Once `gh stack sync` has created the stack, start every PR's body with the stack note from the PR template: the stack number that `gh stack view` prints, which GitHub links to the stack, and the whole chain. Update the notes when a layer is added.
- **Change a layer.** Commit on its branch, then `gh stack sync`: it rebases the branches above and onto the moved trunk, pushes every branch with `--force-with-lease` and updates the stack on GitHub. On a conflict it changes nothing; run `gh stack rebase`, resolve, `gh stack rebase --continue`, and sync again.
- **Add a layer.** `gh stack top`, then `gh stack add <branch>`, commit, push and open its PR on the branch below, then `gh stack sync`.
- **Merge, only when asked:** `gh stack merge <pr> --yes --<method>` merges every PR up to and including `<pr>` into the integration branch in one all-or-nothing step. Never merge a stacked PR on its own: it would land in the branch below it. Afterwards `gh stack sync --prune` deletes the merged local branches.

## Open

1. Fill in `.github/pull_request_template.md` in a scratch file outside the tree. Keep its sections.
2. List each issue the PR resolves as `Closes #<n>`.
3. Ask the user, then push and open the PR:

```sh
git push -u origin <branch>
gh pr create --base <integration branch> --title "<commit-expert title>" --body-file <scratch>/pr.md
```

For a stacked PR, follow [Stacks](#stacks).

## After opening

- **Updates:** edit the body with `gh pr edit <n> --body-file <scratch>/pr.md`.
- **Merge, only when asked,** with the method the project specifies: `gh pr merge <n> --squash` or `--merge`. A stack merges with `gh stack merge`.
- **Close the issues.** `Closes #<n>` closes an issue only when the PR merges into the default branch. When it merged into another branch, close each issue yourself: `gh issue close <n> --comment "Fixed in #<pr>"`.
