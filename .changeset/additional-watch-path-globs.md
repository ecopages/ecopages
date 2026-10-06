---
'@ecopages/core': patch
---

Glob patterns in `additionalWatchPaths` now work in `ecopages dev`. A pattern such as `content/**/*.md` was never watched and never matched, so editing `content/blog/post.md` did not reload the page. Ecopages now watches the folder before the first wildcard (`content` here, or the project root for `**/*.config.ts`) and reloads only for files that match the pattern.

Globs are anchored at the project root. `*.css` used to match any `.css` file and now matches only top-level files; write `**/*.css` to match at any depth. `*` and `**` skip names starting with a dot unless the pattern spells the dot, such as `.github/**/*.yml`. Only entries containing `*` are globs; to match a literal bracket inside a glob, write `[[]`.
