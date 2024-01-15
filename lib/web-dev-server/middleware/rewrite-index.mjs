import { getFileExtension, getContentType } from "../utils.mjs";

const WEB_SOCKET_PATH = "/__web-dev-server__web-socket.js";

const shouldCompress = (extension) => {
  return ["css", "js"].includes(extension);
};

export function gzipSupportMiddleware(context, next) {
  const path = context.url;
  const extension = getFileExtension(path);
  if (shouldCompress(extension) && path !== WEB_SOCKET_PATH) {
    context.url = context.url + ".gz";
    context.set("Content-Encoding", "gzip");
    context.set("Content-Type", getContentType(extension));
  }
  return next();
}
