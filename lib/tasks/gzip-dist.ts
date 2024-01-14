import { DIST_DIR } from "root/lib/eco.constants";
import { extname } from "node:path";
import fs from "node:fs";

export function gzipDirectory(directory: string) {
  fs.readdirSync(directory, { recursive: true }).forEach((file) => {
    const extensionsToGzip = ["css", "js"];
    const ext = extname(file as string).slice(1);
    if (extensionsToGzip.includes(ext)) {
      const data = fs.readFileSync(`${directory}/${file}`);
      const compressedData = Bun.gzipSync(Buffer.from(data));
      const gzipFile = `${directory}/${file}.gz`;
      fs.writeFileSync(gzipFile, compressedData);
    }
  });
}
