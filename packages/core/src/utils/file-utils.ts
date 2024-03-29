import type { BunFile } from "bun";

export class FileUtils {
  public static async get(path: string | URL) {
    const file = Bun.file(path);
    if (!(await file.exists())) throw new Error(`[eco-pages] File: ${path} not found`);
    return file;
  }

  public static async getPathAsString(path: string | URL) {
    const file = await FileUtils.get(path);
    return await file.text();
  }

  public static write(
    path: BunFile | Bun.PathLike,
    contents: string | Blob | NodeJS.TypedArray | ArrayBufferLike | Bun.BlobPart[]
  ) {
    return Bun.write(path, contents);
  }
}
