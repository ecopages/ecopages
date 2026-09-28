# Ship 0.2.0

One-time cut from `release/v0.2.0`. Delete this file after `develop` is the GitHub default branch.

Durable process after this cut: [`README.md`](./README.md).

## History

Merge every pull request in this cut with a merge commit. Do not squash `release/v0.2.0` into `main`.

```bash
gh pr merge <number> --merge
```

The 0.2.0 changelog is the `stable-0.2.0-*.md` files in this folder. RC notes were removed from `pre/` so they do not appear under `## 0.2.0`. Prerelease GitHub Releases and git tags keep that history.

## Sequence

1. Commit and push the pre-exit prep on `release/v0.2.0` (`pre.json` `mode` is `exit`). Direct push is fine; this branch is the RC line. The in-flight Publish run on that push opens the Version Packages PR.
2. Review the Version Packages PR (`## 0.2.0` only). Merge it with a merge commit. That commit versions packages on `release/v0.2.0`. It does not publish; Publish no longer runs on `release/*`.
3. Set `config.json` `baseBranch` to `main`. Open a PR from `release/v0.2.0` into `main` and merge it with a merge commit. That push to `main` runs `test:all` and `changeset publish`.
4. Confirm `npm view @ecopages/core dist-tags` shows `latest: 0.2.0`, and that git tag `v0.2.0` exists (`ecopages init` needs it).
5. Create the default integration branch:

    ```bash
    git checkout main
    git pull
    git checkout -b develop
    git push -u origin develop
    gh repo edit --default-branch develop
    ```

6. Open PRs against `develop`. The next release is `develop` into `main`, also a merge commit.
7. After `develop` is the default and `release/v0.2.0` is on `main`, delete every other GitHub branch. Keep git tags (RC history). About 60 remote branches exist today.

    ```bash
    git fetch --prune origin
    git for-each-ref --format='%(refname:short)' refs/remotes/origin \
      | grep -vE '^origin/(HEAD|main|develop)$' \
      | sed 's|^origin/||' \
      | while read -r branch; do git push origin --delete "$branch"; done
    ```

    Then drop local leftovers (skip worktrees first with `git worktree list`):

    ```bash
    git checkout develop
    git branch | grep -vE '^\*| main$| develop$' | xargs git branch -D
    ```
