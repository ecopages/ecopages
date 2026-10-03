---
scope: {scope-slug}
created: {YYYY-MM-DD}
author: {author-slug}
model: {model-name}
posture: {strict | balanced}
round: 00
---

# Architecture audit: {scope-slug}

**Author:** {author-slug} · **Posture:** {posture} · **Verdict:** {one sentence}

## Navigation

| File | Contents |
|------|----------|
| `01-pattern-analysis.md` | Patterns (strict) |
| `02-cross-cutting-issues.md` | Structural themes (strict) |
| `03-refactor-moves.md` | Refactor moves (strict) |
| `04-bugs.md` | Defects |
| `05-do-not-change.md` | What to preserve (strict) |
| `06-summary.md` | Priorities and open questions |
| `review-*.md` | Second opinions |
| `issues/` | Issue drafts and `manifest.json` |

## TL;DR

{3 to 5 bullets}

## Cross-audit

{Omit this section unless several authors audited.}

| Author | File | Verdict |
|--------|------|---------|
| {author} | `review-{author}.md` | … |

Synthesis: `00-synthesis.md`
