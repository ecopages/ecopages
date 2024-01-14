export function getFileExtension(path) {
  const parts = path.split(".");
  if (parts.length === 1) return "";
  switch (parts[parts.length - 1]) {
    case "html":
    case "ico":
    case "css":
    case "js":
    case "png":
    case "jpg":
    case "svg":
    case "json":
    case "txt":
      return parts[parts.length - 1];
    default:
      return "";
  }
}

export function getSafePath(path, extension) {
  if (path === "/") return "/index.html";

  switch (extension) {
    case "css":
    case "js":
    case "html":
    case "ico":
    case "png":
    case "jpg":
    case "svg":
    case "json":
    case "txt":
      return path;
    default:
      return path + ".html";
  }
}

export function getContentType(extension) {
  switch (extension) {
    case "html":
      return "text/html";
    case "css":
      return "text/css";
    case "js":
      return "text/javascript";
    case "png":
      return "image/png";
    case "jpg":
      return "image/jpg";
    case "svg":
      return "image/svg+xml";
    case "json":
      return "application/json";
    case "ico":
      return "image/x-icon";
    default:
      return "text/plain";
  }
}
