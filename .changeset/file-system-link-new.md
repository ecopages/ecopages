---
'@ecopages/file-system': minor
---

Add `linkNew(source, destination)` and `linkNewAsync(source, destination)` to the file system. They install `source` at `destination` only when nothing is there yet, atomically, and return `false` instead of throwing when `destination` exists, so of several processes that install a seeded file at once exactly one wins and none overwrites another. The file is hard-linked; on a volume that cannot hold a hard link, or across two volumes, it is copied with an exclusive create instead, so callers do not handle those errors. Any other failure, such as a missing source, still throws Node's error. `FileSystem` implementations outside this package must add both methods.
