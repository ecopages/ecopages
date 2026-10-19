---
'@ecopages/file-system': patch
---

Add `stat`, `lstat`, `readdir`, `readlink`, `mkdtemp` and `rename`. `stat`, `lstat` and `readdir` report whether a path is a file, a directory or a symbolic link (and its size for stats); `readdir` can list subdirectories too. A missing path throws an error whose `code` is `ENOENT`.
