---
name: commit-expert
description: Use when writing commit messages, PR titles, changelog lines, changesets or short release notes, or when splitting work into commits. Conventional commits, concise wording, direct technical language, and no fluff.
---

# Commit expert

Write short, precise engineering-facing messages: commit messages, PR titles, changelog lines, release notes.

**Project specifics** (allowed types and scopes, a title length limit, release-note rules) come from the project's `AGENTS.md` and the project skill it names, or its commit tooling config. They override the defaults below.

## Format

`type(scope): concise outcome`

**Types** (common defaults): `fix` (wrong to correct), `feat` (new capability), `refactor` (internals only), `perf`, `docs`, `test`, `build`, `ci`, `chore`.

**Scope:** the package or subsystem that changed. Keep it singular. Omit it if it adds no clarity.

## Rules

- One line unless the user asks for a body.
- Describe the outcome, not the process.
- Name the concrete module, API or boundary that changed, not a vague area.
- No filler, no marketing language, no preamble such as "Here is your commit message".
- When it is too long: cut filler, then use precise nouns, then drop secondary details. Keep the primary behaviour.

**Good:** `fix(router): restore scroll position on back navigation`
**Bad:** `fix(router): improve the navigation logic for better scroll handling`

## PR titles

Same style as commit subjects.

## Release notes

A changelog line is plain and factual, one line per change, and matches shipped behaviour, not the intermediate implementation:

`Restore the scroll position on back navigation.`

When the project uses Changesets, write the file yourself, even where its docs say to run the CLI: the `changeset` CLI is interactive and stalls an agent, and the result is the same file. Create `.changeset/<kebab-slug>.md` with each package's bump in the frontmatter, then describe the final user-facing behaviour, in a few sentences when needed. For a breaking change, say so and give the migration steps. The project's changeset docs say which packages need one.

```markdown
---
'<package-name>': minor
---

Add …
```

## Commit segmentation

When asked to split work into commits, output a single fenced shell block:

- Group files by logical change, not by directory.
- Order the commits so each one leaves the tree consistent.
- Use explicit file paths in `git add` (no globs, no `-A`), including deleted files.
- Separate each `git add` and `git commit -m` pair with a blank line.
- No prose, bullets or commentary outside the block.

```bash
git add path/to/file-a.ts path/to/file-b.ts
git commit -m "fix(scope): concise outcome"

git add path/to/file-c.ts
git commit -m "refactor(scope): concise outcome"
```

## Output

- Asked for text (a message, a title, a changelog line): output only that text. Explain only if asked.
- Asked to split work into commits: output only the fenced shell block.
- Committing as part of a flow, such as final-review or a PR: run `git commit` with the message yourself; do not print it instead.
