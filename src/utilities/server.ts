export function getContentType(path: string) {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "text/javascript";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg")) return "image/jpg";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".txt")) return "text/plain";
  return "text/plain";
}

export function getSafePath(path: string) {
  if (path === "/") return "/index.html";
  if (path.endsWith(".html")) return path;
  if (path.endsWith(".ico")) return path;
  if (path.endsWith(".css")) return path;
  if (path.endsWith(".js")) return path;
  if (path.endsWith(".png")) return path;
  if (path.endsWith(".jpg")) return path;
  if (path.endsWith(".svg")) return path;
  if (path.endsWith(".json")) return path;
  if (path.endsWith(".txt")) return path;
  return path + ".html";
}
