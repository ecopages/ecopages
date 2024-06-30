import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { GlobScanOptions } from 'bun';

function copyDirSync(source: string, destination: string) {
  cpSync(source, destination, { recursive: true });
}

function ensureDirectoryExists(path: string, forceCleanup?: boolean): void {
  if (existsSync(path)) {
    if (forceCleanup) {
      rmdirSync(path, {
        recursive: true,
      });

      mkdirSync(path);

      return;
    }
  } else {
    mkdirSync(path);
  }
}

function verifyFileExists(path: string): void {
  if (!existsSync(path)) {
    throw new Error(`File: ${path} not found`);
  }
}

function getFileAsBuffer(path: string): Buffer {
  try {
    verifyFileExists(path);
    return readFileSync(path);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`[ecopages] Error reading file: ${path}, ${errorMessage}`);
  }
}

async function glob(
  pattern: string[],
  scanOptions: string | GlobScanOptions = { cwd: process.cwd() },
): Promise<string[]> {
  const promises = pattern.map((p) => {
    const glob = new Bun.Glob(p);
    return Array.fromAsync(glob.scan(scanOptions));
  });

  const results = await Promise.all(promises);
  return results.flat();
}

function gzipDirSync(path: string, extensionsToGzip: string[]) {
  const files = readdirSync(path, { recursive: true });
  for (const file of files) {
    const ext = extname(file as string).slice(1);
    if (extensionsToGzip.includes(ext)) {
      const data = readFileSync(`${path}/${file}`);
      const compressedData = Bun.gzipSync(Buffer.from(data));
      const gzipFile = `${path}/${file}.gz`;
      writeFileSync(gzipFile, compressedData);
    }
  }
}

function write(path: string, contents: string | Buffer): void {
  try {
    const dirs = path.split('/');
    let currentPath = '';
    for (let i = 0; i < dirs.length - 1; i++) {
      currentPath += `${dirs[i]}/`;
      if (!existsSync(currentPath)) {
        mkdirSync(currentPath);
      }
    }
    writeFileSync(path, contents);
  } catch (error) {
    throw new Error(`[ecopages] Error writing file: ${path}`);
  }
}

export const FileUtils = {
  glob,
  getFileAsBuffer,
  existsSync,
  write,
  verifyFileExists,
  ensureFolderExists: ensureDirectoryExists,
  copyDirSync,
  gzipDirSync,
  writeFileSync,
};
