# @ecopages/file-system

Runtime-agnostic file system utilities for Ecopages with optimized Bun and Node.js adapters.

## Features

- **Runtime Detection**: Automatically selects optimal adapter based on runtime
- **Bun Optimized**: Uses `Bun.Glob`, `Bun.hash`, `Bun.file` for maximum performance
- **Node.js Fallback**: Uses `fast-glob` and `crypto` for full compatibility
- **Type Safe**: Full TypeScript support with consistent interface

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
```

## API

| Method                      | Description                       |
| --------------------------- | --------------------------------- |
| `glob(patterns, options)`   | Find files matching glob patterns |
| `readFile(path)`            | Read file as string (async)       |
| `readFileSync(path)`        | Read file as string (sync)        |
| `readFileAsBuffer(path)`    | Read file as Buffer               |
| `write(path, content)`      | Write content to file             |
| `writeAsync(path, content)` | Write content to file (async)     |
| `exists(path)`              | Check if path exists              |
| `ensureDir(path)`           | Ensure directory exists           |
| `copyDir(src, dest)`        | Copy directory recursively        |
| `copyFile(src, dest)`       | Copy single file                  |
| `remove(path)`              | Remove file or directory          |
| `removeAsync(path)`         | Remove file or directory (async)  |
| `hash(path)`                | Get hash of file contents         |
| `gzipFile(path)`            | Gzip a single file                |
| `gzipDir(path, extensions)` | Gzip files in directory           |
| `isDirectory(path)`         | Check if path is directory        |
| `verifyFileExists(path)`    | Throw if file doesn't exist       |

## Performance

Benchmark results (Apple M4):

| Operation        | BunFileSystem | NodeFileSystem |
| ---------------- | ------------- | -------------- |
| glob (100 files) | 64.85 µs      | 71.06 µs       |
| hash (1MB file)  | **87 µs**     | **393 µs**     |

Bun adapter is **4.5x faster** for file hashing.

## License

MIT
