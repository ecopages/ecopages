# Changesets

Versioning, changelogs, and npm publishing for public Ecopages packages. [Changesets documentation](https://github.com/changesets/changesets).

PRs that change user-facing package behavior add a changeset. Merging into `main` versions and publishes. Do not edit package versions or `CHANGELOG.md` for release notes.

## Mental model

`develop` is the default integration branch. Feature work lands there. `main` is production.

A changeset describes the **final** author-facing behavior, not the implementation steps that got there. Public packages are one **fixed** group, so they always share a version. Private workspace packages (playgrounds, templates, docs, fixtures) are not published. The repo-root `package.json` is not a workspace member, so Changesets cannot bump it. Version Packages runs `pnpm run changeset:version`, which copies the CLI version onto the root manifest after `changeset version`.

## After a change

1. Open the PR against `develop`. Run `pnpm changeset` and commit the file this folder creates.
2. When you are ready to release, open a PR that merges `develop` into `main`. Publish runs `test:all`, then opens a Version Packages PR against `main` that bumps versions and writes each package `CHANGELOG.md`.
3. Merge the Version Packages PR with a merge commit (`gh pr merge --merge`). Publish runs `test:all` again, builds `dist`, and runs `changeset publish`.

Feature PRs into `develop` may squash. Merging into `main` uses a merge commit so production history stays intact.

## Files of record

These files must name the same production line. Editing only this README does not retarget a release.

| File                                                                                   | Role                                                                                                 |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [`config.json`](./config.json) `baseBranch`                                            | Branch Changesets diffs against when assembling a release.                                           |
| [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) `on.push.branches` | Pushes that run versioning and publish. Production is `main` only.                                   |
| `pnpm run changeset:version`                                                           | Version Packages command: `changeset version`, then sync root `package.json` to the CLI version.     |
| [`pre.json`](./pre.json)                                                               | Present in pre mode (`mode: pre`) or while exiting it (`mode: exit`). Delete after a stable version. |

## Pre mode

`pnpm changeset pre enter <tag>` writes `pre.json`. While `mode` is `pre`, Version Packages PRs append `-<tag>.N` and npm publish uses that dist-tag (`rc` → `0.2.0-rc.14` on dist-tag `rc`).

New changesets belong in `.changeset/*.md` with YAML frontmatter. `README.md` is the only other markdown this folder may contain; extra files here are parsed as changesets and fail Publish. After a version, pre mode moves that file into `.changeset/pre/`. Files already in `pre/` are consumed again on the next **stable** version unless you delete or rewrite them first.

`pnpm changeset pre exit` sets `mode` to `exit`. The next Version Packages PR promotes to a stable version and publishes to `latest`.

## What gets published

The npm tarball is the compiled `dist` of each public package, not the TypeScript source used in the workspace. Committed manifests omit `publishConfig.directory` so workspace installs keep linking to source. Publish compiles `dist` and stamps `directory` only at publish time. Already-published versions are skipped. A new package name still needs a one-time npm trusted-publishing setup.

`ecopages init` fetches official templates from git tag `v${cliVersion}`. Publish creates that tag after a successful `changeset publish`.
