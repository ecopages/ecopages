import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import zlib from 'node:zlib';
import { fdir } from 'fdir';

function copyDirSync(source: string, destination: string) {
  cpSync(source, destination, { recursive: true });
}

function ensureFolderExists(path: string, forceCleanup?: boolean): void {
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

function getFileAsBuffer(path: string) {
  try {
    verifyFileExists(path);
    return readFileSync(path);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`[ecopages] Error reading file: ${path}, ${errorMessage}`);
  }
}

function glob(pattern: string[], options: { cwd: string } = { cwd: process.cwd() }): string[] {
  return new fdir()
    .exclude((dirName, dirPath) => {
      return dirName.startsWith('.') || dirName === 'node_modules';
    })
    .withRelativePaths()
    .glob(...pattern)
    .crawl(options.cwd)
    .sync();
}

function gzipDirSync(path: string, extensionsToGzip: string[]) {
  // @ts-expect-error - TS doesn't know about the recursive option
  const files = readdirSync(path, { recursive: true });
  for (const file of files) {
    const ext = extname(file as string).slice(1);
    if (extensionsToGzip.includes(ext)) {
      const data = getFileAsBuffer(`${path}/${file}`);
      const compressedData = zlib.gzipSync(Buffer.from(data));
      const gzipFile = `${path}/${file}.gz`;
      writeFileSync(gzipFile, compressedData);
    }
  }
}

function write(path: string, contents: string | Buffer) {
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
  ensureFolderExists,
  copyDirSync,
  gzipDirSync,
  writeFileSync,
};
