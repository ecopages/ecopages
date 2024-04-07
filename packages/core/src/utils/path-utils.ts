import path from "path";

export class PathUtils {
  static getNameDescriptor(filePath: string) {
    const { name } = path.parse(filePath);
    const nameParts = name.split(".");
    const descriptor = nameParts.length > 1 ? nameParts.pop() : undefined;

    return descriptor;
  }
}
