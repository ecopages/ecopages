import fs from "node:fs";
import { extname } from "node:path";
import type { BunFile } from "bun";

export class FileUtils {
  static async get(path: string | URL) {
    const file = Bun.file(path);
    if (!(await file.exists())) throw new Error(`[eco-pages] File: ${path} not found`);
    return file;
  }

  static async getPathAsString(path: string | URL) {
    const file = await FileUtils.get(path);
    return await file.text();
  }

  static write(
    path: BunFile | Bun.PathLike,
    contents: string | Blob | NodeJS.TypedArray | ArrayBufferLike | Bun.BlobPart[]
  ) {
    return Bun.write(path, contents);
  }

  static ensureFolderExists(path: string, forceCleanup: boolean): void {
    if (fs.existsSync(path)) {
      if (forceCleanup) {
        fs.rmdirSync(path, {
          recursive: true,
        });

        fs.mkdirSync(path);

        return;
      }
    } else {
      fs.mkdirSync(path);
    }
  }

  static copyDirSync(source: string, destination: string) {
    fs.cpSync(source, destination, { recursive: true });
  }

  static gzipDirSync(path: string, extensionsToGzip: string[]) {
    fs.readdirSync(path, { recursive: true }).forEach((file) => {
      const ext = extname(file as string).slice(1);
      if (extensionsToGzip.includes(ext)) {
        const data = fs.readFileSync(`${path}/${file}`);
        const compressedData = Bun.gzipSync(Buffer.from(data));
        const gzipFile = `${path}/${file}.gz`;
        fs.writeFileSync(gzipFile, compressedData);
      }
    });
  }

  static writeFileSync = fs.writeFileSync;
}
