import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { BunFile, GlobScanOptions } from 'bun';

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

async function writeStream(path: string, stream: ReadableStream) {
  const response = new Response(stream);
  await Bun.write(path, response);
}

async function glob(
  pattern: string,
  scanOptions: string | GlobScanOptions = { cwd: process.cwd() },
): Promise<string[]> {
  const glob = new Bun.Glob(pattern);
  return await Array.fromAsync(glob.scan(scanOptions));
}

export const FileUtils = {
  get,
  glob,
  getPathAsString,
  existsSync,
  write,
  ensureFolderExists,
  copyDirSync,
  gzipDirSync,
  writeFileSync,
  writeStream,
};
