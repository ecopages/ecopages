# Changesets

Versioning, changelogs, and npm publishing for public Ecopages packages. [Changesets documentation](https://github.com/changesets/changesets).

## What to do after a change

1. Run `pnpm changeset` and describe the **final** user-facing behavior. Commit the markdown file this folder creates.
2. Merge into a branch listed in [`.github/workflows/publish.yml`](../.github/workflows/publish.yml). The Publish workflow runs `test:all`, then opens a Version Packages pull request: it bumps versions and writes each package `CHANGELOG.md`.
3. Merge that pull request. The same workflow runs `test:all` again, then builds `dist` and runs `changeset publish`.

Do not edit package versions or `CHANGELOG.md` for release notes. Changesets owns those files.

Public packages are one **fixed** group, so they always share a version. Private workspace packages (playgrounds, templates, docs, fixtures) are ignored.

## Files of record

| File                                                                                   | Role                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [`pre.json`](./pre.json)                                                               | Present while Changesets is in pre mode. `tag` is the prerelease identifier and the npm dist-tag (`rc` → `1.2.3-rc.0` on dist-tag `rc`). |
| [`config.json`](./config.json) `baseBranch`                                            | Branch Changesets diffs against when assembling a release.                                                                               |
| [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) `on.push.branches` | Pushes that run versioning and publish.                                                                                                  |

Keep `baseBranch` and the Publish branch list pointed at the line you are actually cutting. Adding or removing a prerelease branch is a workflow and `baseBranch` edit, not a README edit.

## Pre mode

`pnpm changeset pre enter <tag>` writes `pre.json`. While that file exists with `"mode": "pre"`, Version Packages PRs append `-<tag>.N` and npm publish uses that dist-tag instead of `latest`.

`pnpm changeset pre exit` marks the intent to leave pre mode. The next Version Packages PR promotes to a stable version and publishes to `latest`.

## What gets published

The npm tarball is the compiled `dist` directory of each public package (`publishConfig.directory`), not the TypeScript source used in the workspace. `pnpm run build:npm` produces that `dist` only when the workflow actually publishes, not when it opens a Version Packages pull request. Already-published versions are skipped. A brand-new package name still needs a one-time npm trusted-publishing setup.
