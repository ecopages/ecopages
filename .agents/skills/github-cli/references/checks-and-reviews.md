# Checks and reviews

## CI

```sh
gh pr checks <n>                         # status of every check on a PR
gh run list --branch <branch> --limit 5  # recent workflow runs
gh run view <run-id> --log-failed        # only the failing steps' logs
gh run rerun <run-id> --failed           # rerun failed jobs (ask first)
```

The workflows in `.github/workflows/` name the script each job runs. Reproduce a failure locally with the same script before changing code.

## Reviews

```sh
gh pr view <n> --comments                         # conversation and review summaries
gh api repos/{owner}/{repo}/pulls/<n>/comments    # inline review comments with path and line
gh pr diff <n>                                    # the diff under review
```

`gh api` fills in `{owner}` and `{repo}` from the current repository.

To answer a review:

1. Fix the code on the branch and run [final-review](../../final-review/SKILL.md).
2. Commit with [commit-expert](../../commit-expert/SKILL.md).
3. Ask the user, then push.
4. Reply on each thread with what changed, not a restatement of the comment:

```sh
gh api repos/{owner}/{repo}/pulls/<n>/comments/<comment-id>/replies -f body="<what changed>"
```

Leave resolving threads to the reviewer.
