---
'@ecopages/core': minor
---

Strip a package stylesheet import from a module with no `eco.*()` declaration when a comment sits right before `import`, as in `/* theme */import 'some-lib/theme'`. The check that decides whether to parse a module no longer misses that form.
