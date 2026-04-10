---
name: commit-expert
description: 'Use when writing commit messages, PR titles, changelog lines, or short release notes for this user. Follows their preferences: conventional commits, concise wording, direct technical language, and no fluff.'
---

# Commit Expert

This skill defines how to write short engineering-facing messages for this user, especially commit messages and nearby artifacts such as PR titles, changelog lines, and release summaries.

## Core Rules

- Use conventional commit prefixes when the format fits: `fix`, `feat`, `refactor`, `docs`, `test`, `chore`.
- Keep the message compact and high-signal.
- Prefer one line unless the user explicitly asks for a body.
- Avoid bullets and blank lines in short commit-style output unless explicitly requested.
- Describe the user-visible behavior, contract change, or engineering outcome.
- Do not pad with marketing language, praise, or filler.

## Tone

- Direct
- Technical
- Specific
- Unsweetened
- Shipping-oriented

Write like a senior engineer leaving a clean, useful history for other engineers.

## What This User Prefers

- Conventional commit formatting.
- Tight wording, often with hard length constraints.
- No decorative formatting.
- No empty preamble like "Here is your commit message".
- No generic wording like "update stuff" or "improve handling" when the concrete change can be named.
- No bullet lists or white lines when they asked for a commit comment.

## Default Format

Use this shape by default:

`type(scope): concise outcome`

Examples:

- `fix(router): hand off non-React navigations to browser-router`
- `feat(cache): reuse prefetched documents during client navigation`
- `docs(react-router): clarify mixed-runtime opt-in behavior`

## How To Choose The Verb

- Use `fix` when behavior was wrong and is now corrected.
- Use `feat` when a new capability was added.
- Use `refactor` when internals changed without intended behavior change.
- Use `docs` when only documentation changed.
- Use `test` when the change is limited to coverage or fixtures.
- Use `chore` only for maintenance work that does not fit the others.

## How To Choose The Scope

- Prefer the package, subsystem, or boundary that changed.
- Keep it singular and recognizable.
- Good scopes: `router`, `core`, `browser-router`, `react-router`, `hmr`, `docs`.
- Omit the scope if it makes the line worse.

## Message Construction Rules

- Lead with the actual behavior change.
- Name the important boundary when it matters: handoff, hydration, routing, HMR, cache, ownership.
- Prefer concrete nouns over vague abstractions.
- Cut implementation trivia unless it changes meaning.
- If there is a length limit, compress adjectives before compressing meaning.

## Preferred Compression Strategy

When a line is too long:

1. Remove filler words.
2. Replace broad phrases with precise nouns.
3. Drop secondary details.
4. Keep the primary behavior intact.

Prefer:

- `fix(router): hand off non-React docs to browser-router`

Over:

- `fix(router): improve the cross-runtime navigation logic for non-React pages`

## Changelog Style

For changelog lines in this repo:

- Keep them plain and factual.
- Use one line per change.
- Match the final shipped behavior, not the intermediate implementation.
- Group under the appropriate heading when editing a changelog, but do not include extra commentary.

Examples:

- `Fix react-router handoff to browser-router for non-React navigations.`
- `Document mixed-runtime opt-in behavior for browser-router and react-router.`

## PR Title Style

PR titles should usually follow the same style as commit subjects:

- `fix(router): preserve non-React handoff during React navigations`
- `docs(browser-router): document mixed-runtime ownership rules`

## Review Checklist

Before sending a commit-style message, check:

- Is the type correct?
- Is the scope useful?
- Does the line describe the outcome rather than the process?
- Can another engineer understand the change without opening the diff?
- Did you remove filler and formatting noise?

## Commit Segmentation

When the user asks to split work into granular commits, produce a single fenced shell block containing explicit `git add` and `git commit` commands that the user can copy-paste directly from the chat. Follow these rules:

- Group files by logical change, not by package or directory.
- Order commits so each one leaves the tree in a consistent state.
- Use `git add` with explicit file paths (no globs, no `-A`).
- Use `git commit -m` with a conventional commit message.
- Separate each `git add` + `git commit` pair with a blank line.
- Do not include prose, bullets, commentary, or headers outside the fenced block.
- Do not include audit, lockfile, or other files the user explicitly excluded.
- Deleted files must be included in `git add` so git records the removal.

Example output shape:

```bash
git add path/to/file-a.ts path/to/file-b.ts
git commit -m "fix(scope): concise outcome"

git add path/to/file-c.ts
git commit -m "refactor(scope): concise outcome"
```

## Output Rule

If the user asks for a commit message, output only the message unless they explicitly ask for alternatives or explanation.
If the user asks for commit segmentation, output only the fenced shell block unless they explicitly ask for explanation.
