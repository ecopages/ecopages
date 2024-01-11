import { withHtmlLiveReload } from "bun-html-live-reload";

const DIST_FOLDER = "./dist";

function getContentType(path: string) {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "text/javascript";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg")) return "image/jpg";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".json")) return "application/json";
  return "text/plain";
}

function getSafePath(path: string) {
  if (path === "/") return "/index.html";
  if (path.endsWith(".html")) return path;
  if (path.endsWith(".ico")) return path;
  if (path.endsWith(".css")) return path;
  if (path.endsWith(".js")) return path;
  if (path.endsWith(".png")) return path;
  if (path.endsWith(".jpg")) return path;
  if (path.endsWith(".svg")) return path;
  if (path.endsWith(".json")) return path;
  return path + ".html";
}

export const server = Bun.serve({
  port: 3003,
  fetch(request) {
    const url = new URL(request.url);
    const safePath = getSafePath(url.pathname);
    const file = Bun.file(DIST_FOLDER + safePath);
    if (!file.exists) return new Response("404", { status: 404 });
    return new Response(file, {
      headers: {
        "content-type": getContentType(safePath),
      },
    });
  },
});

console.log(`Listening on ${server.url}`);
