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
}
