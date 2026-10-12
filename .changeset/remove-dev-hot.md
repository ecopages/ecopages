---
ecopages: minor
---

Remove `ecopages dev:hot` and `-r` / `--react-fast-refresh`. On Node neither changed `ecopages dev`. Bun now launches the entry file with the same arguments, plus `--watch` when Node gets it.

**Breaking:**

- `ecopages dev:hot` is an unknown command. Use `ecopages dev`.
- `-r` and `--react-fast-refresh` are unknown flags. There is no alias.
