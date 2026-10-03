# Issues

## The draft

One Markdown file per issue: frontmatter, then the body. The angle-bracket values are placeholders:

```markdown
---
template: <form file name, such as bug>
title: Production export reuses stale pages after a shared module changes
labels: [<from .github/labels.yml>]
milestone: <an existing milestone>
---

### Problem
…
```

| Field | Required | Meaning |
|-------|----------|---------|
| `template` | yes | The file name of a form in `.github/ISSUE_TEMPLATE/`, without the extension. It sets the issue type, the default labels and the allowed sections. |
| `title` | yes | Plain sentence case: the defect or the outcome |
| `labels` | no | A list. With `.github/labels.yml`, each must be listed there; choose by the descriptions. |
| `milestone` | no | Pick an existing one (`gh api repos/{owner}/{repo}/milestones --jq '.[].title'`) by the project's convention. A new title is created, so add one only when the convention calls for a new release line. |
| `parent` | no | Key of the tracking issue this one belongs to |
| `blockedBy` | no | Keys of the issues that must land first |
| `key` | no | Defaults to the file name. Other drafts refer to it. |

**Body.** Use one `### Section` per field label of the form, in the form's order. Required fields must be present, and other sections are rejected. Read each field's `description` for what it holds. The sections match what the web form produces, so agent-written and human-written issues look alike.

**Content.**

- Lead with the problem in this repository and its evidence.
- Link code at a commit, never a branch: `gh browse <path>:<line> --commit=<sha> --no-browser` prints the URL.
- A factual citation of how another project handles the same thing may support the problem, but it is never the reason. Do not frame the work as copying another project, or as the output of an audit.
- A bug written by an agent always states its acceptance: the regression test that fails today.

**References between drafts.** In one folder, `#{KEY}` in a body becomes the issue number once that issue exists.

## Create

`<issue script>` is the command in [the skill's Issue script section](../SKILL.md#issue-script).

```sh
gh issue list --search "<key words>" --state all     # check for a duplicate first
<issue script> path/to/draft.md                      # validate and show what would be created
<issue script> path/to/draft.md --apply              # create it (ask the user first)
<issue script> path/to/folder --apply                # a whole set, in dependency order
```

The script records `key → issue number` in `manifest.json` beside the drafts. Re-running it creates only what is missing, and it fills in `#{KEY}` references and "blocked by" links as their targets appear. A `parent` must already exist or be created in the same run.

`--forbid a,b` fails validation when a title or body contains any of those words. Use the words the user names, on the command line, never in a committed file.

## Programs

A program is one tracking issue plus one sub-issue per change.

- Draft the tracking issue: its goal, its scope and non-goals, and when it is done.
- Give each change `parent: <tracking key>`, and order the changes with `blockedBy`.
- A question a maintainer must answer first is its own issue (the decision form, when the project has one), with a parent when it belongs to a program.

Read a program's state:

```sh
gh issue view <tracking> --json subIssues       # its changes and their state
gh issue view <n> --json blockedBy,parent       # what one change waits on
```

## After creation

- **Edit:** `gh issue edit <n> --add-label …`, `--milestone …`, `--parent <p>`, `--add-blocked-by <n>`.
- **Close:** let the merged PR close it ([pull-requests.md](pull-requests.md)). Close by hand only for won't-fix, with the reason: `gh issue close <n> --reason "not planned" --comment "<why>"`.
