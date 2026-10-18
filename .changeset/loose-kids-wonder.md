---
'@ecopages/core': minor
---

**Breaking:** `ProcessorWatchConfig` replaces `onCreate`, `onChange`, and `onDelete` with one `onChanges` callback. This lets processors rebuild once for a debounce batch instead of once per file. Migrate by implementing `onChanges({ created, changed, deleted, bridge })`; each path array contains the absolute paths for that event kind. The type `ProcessorWatchContext` is replaced by `ProcessorWatchChanges`. Watch extensions still select notifications, and capabilities still declare asset ownership.
