import path from "path";

export function pathAnalyser(filePath: string) {
  const { root, dir, base, ext, name } = path.parse(filePath);
  const nameParts = name.split(".");
  const descriptor = nameParts.length > 1 ? nameParts.pop() : undefined;

  return {
    root,
    dir,
    base,
    ext,
    name,
    descriptor,
  };
}
