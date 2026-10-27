# @ecopages/file-system

Runtime file system utilities for Ecopages. The implementation is Node's `node:fs` and `crypto` on every runtime, including Bun.

## Features

- **Node implementation**: `node:fs/promises.glob()`, `crypto`, and `node:fs` on every runtime.
- **One interface**: Call sites import `fileSystem` and do not choose an adapter. Tests replace it with `installFileSystem` and can wrap it with `createRecordingFileSystem` to observe every path argument.
- **Type Safe**: Full TypeScript support with a consistent API.

## Installation

```bash
bun add @ecopages/file-system
```

## Usage

```typescript
import { fileSystem } from '@ecopages/file-system';

// Glob files
const files = await fileSystem.glob(['**/*.ts'], { cwd: './src' });

// Read files
const content = await fileSystem.readFile('file.txt');

// Hash files
const hash = fileSystem.hash('file.txt');

// Write files
fileSystem.write('output.txt', 'Hello World');

// Check existence
if (fileSystem.exists('file.txt')) {
	// ...
}

// Watch a tree, skipping dependencies
const watcher = fileSystem.watch(['./src'], {
	ignored: (path) => path.includes('node_modules'),
	onChange: ({ type, path }) => console.log(type, path),
	onError: (error) => console.error(error),
});
await watcher.ready;
await watcher.close();
```

## API

| Method                             | Description                                   |
| :--------------------------------- | :-------------------------------------------- |
| `glob(patterns, options)`          | Find files matching glob patterns             |
| `readFile(path)`                   | Read file as string (async)                   |
| `readFileSync(path)`               | Read file as string (sync)                    |
| `readFileAsBuffer(path)`           | Read file as `Buffer`                         |
| `write(path, content)`             | Write content to file                         |
| `writeAsync(path, content)`        | Write content to file (async)                 |
| `exists(path)`                     | Check if path exists                          |
| `ensureDir(path)`                  | Ensure directory exists                       |
| `copyDir(src, dest)`               | Copy directory recursively                    |
| `copyFile(src, dest)`              | Copy single file                              |
| `remove(path)`                     | Remove file or directory                      |
| `removeAsync(path)`                | Remove file or directory (async)              |
| `hash(path)`                       | Get hash of file contents                     |
| `gzipFile(path)`                   | Gzip a single file                            |
| `gzipDir(path, extensions)`        | Gzip files in directory                       |
| `isDirectory(path)`                | Check if path is directory                    |
| `realpath(path)`                   | Resolve symlinks to canonical path            |
| `stat(path)`                       | Kind and size, following symlinks             |
| `lstat(path)`                      | Kind and size of the path itself              |
| `readdir(path, options)`           | List entries with their kind                  |
| `readlink(path)`                   | Read a symlink's stored target                |
| `mkdtemp(prefix)`                  | Create a uniquely named directory             |
| `rename(src, dest)`                | Move a file or directory                      |
| `verifyFileExists(path)`           | Throw if file doesn't exist                   |
| `watch(paths, options)`            | Watch files and directories                   |
| `installFileSystem(next)`          | Replace the process-wide `fileSystem` (tests) |
| `createRecordingFileSystem(inner)` | Wrap `inner` and record every path argument   |

`stat`, `lstat` and `readdir` return plain objects (`isFile`, `isDirectory`, `isSymbolicLink`, plus `size` for stats). `readdir(path, { recursive: true })` also lists subdirectories, naming each entry by its path relative to `path`. `stat`, `lstat`, `readdir`, `readlink`, `mkdtemp` and `rename` throw Node's error unchanged, so a missing path can be detected by `error.code === 'ENOENT'`.
