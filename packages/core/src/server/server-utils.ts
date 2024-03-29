import path from "path";
import { FileUtils } from "@/utils/file-utils";

export class ServerUtils {
  static getContentType(path: string) {
    const ext = path.split(".").pop();
    if (ext === "js") return "application/javascript";
    if (ext === "css") return "text/css";
    if (ext === "html") return "text/html";
    if (ext === "json") return "application/json";
    if (ext === "png") return "image/png";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "svg") return "image/svg+xml";
    if (ext === "gif") return "image/gif";
    if (ext === "ico") return "image/x-icon";
    return "text/plain";
  }

  static async serveFromDir(config: {
    directory: string;
    path: string;
    gzip: boolean;
  }): Promise<Response> {
    const { rootDir } = globalThis.ecoConfig;
    let basePath = path.join(rootDir, config.directory, config.path);
    const contentType = ServerUtils.getContentType(path.extname(basePath));

    if (config.gzip && ["application/javascript", "text/css"].includes(contentType)) {
      const gzipPath = `${basePath}.gz`;
      const file = await FileUtils.getFile(gzipPath);
      return new Response(file, {
        headers: {
          "Content-Type": contentType,
          "Content-Encoding": "gzip",
        },
      });
    }

    if (config.path.includes(".")) {
      const file = await FileUtils.getFile(basePath);
      return new Response(file, {
        headers: { "Content-Type": contentType },
      });
    }

    const pathWithSuffix = path.join(basePath, "index.html");
    const file = await FileUtils.getFile(pathWithSuffix);
    return new Response(file, {
      headers: { "Content-Type": ServerUtils.getContentType(path.extname(pathWithSuffix)) },
    });
  }
}
