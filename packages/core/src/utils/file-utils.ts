export class FileUtils {
  public static async getFile(filePath: string) {
    const file = Bun.file(filePath);
    if (!(await file.exists())) throw new Error("File not found");
    return file;
  }
}
