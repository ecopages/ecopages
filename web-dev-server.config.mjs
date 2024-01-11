import { hmrPlugin, presets } from "@open-wc/dev-server-hmr";

function getSafePath(path) {
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

export default {
  open: false,
  rootDir: "dist",
  watch: true,
  middleware: [
    function rewriteIndex(context, next) {
      context.url = getSafePath(context.url);
      return next();
    },
  ],
  plugins: [
    hmrPlugin({
      include: ["dist/**/*"],
      presets: [presets.lit],
    }),
  ],
};
