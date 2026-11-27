---
'@ecopages/file-system': minor
---

Add `linkNew(source, destination)` and `linkNewAsync(source, destination)` to the file system. They install `source` at `destination` as a hard link only when nothing is there yet, atomically, and return `false` instead of throwing when `destination` exists, so of several processes that install a seeded file at once exactly one wins and none overwrites another. Any other failure, such as a missing source, still throws Node's error. `FileSystem` implementations outside this package must add both methods.
