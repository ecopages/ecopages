import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { BunFile } from 'bun';

async function get(path: string | URL) {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`[eco-pages] File: ${path} not found`);
  return file;
}

async function getPathAsString(path: string | URL) {
  const file = await FileUtils.get(path);
  return await file.text();
}

function write(
  path: BunFile | Bun.PathLike,
  contents: string | Blob | NodeJS.TypedArray | ArrayBufferLike | Bun.BlobPart[],
) {
  return Bun.write(path, contents);
}

function ensureFolderExists(path: string, forceCleanup: boolean): void {
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

function copyDirSync(source: string, destination: string) {
  cpSync(source, destination, { recursive: true });
}

function gzipDirSync(path: string, extensionsToGzip: string[]) {
  // @ts-expect-error - TS doesn't know about the recursive option
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

export const FileUtils = {
  get,
  getPathAsString,
  write,
  ensureFolderExists,
  copyDirSync,
  gzipDirSync,
  writeFileSync,
};
