import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { getContentType, getSafePath } from "./src/utilities/server";
import { startWatcher } from "./eco.builder";
import {
  DIST_FOLDER,
  WS_HOT_RELOAD_URL,
  WS_HOT_RELOAD_CHANNEL,
  RELOAD_COMMAND,
} from "./eco.constants";
import { makeHotReloadScript } from "./utilities/make-hot-reload";

export const app = new Elysia()
  .use(staticPlugin({ alwaysStatic: true, assets: DIST_FOLDER }))
  .get("*", async ({ request }) => {
    const url = new URL(request.url);
    const safePath = getSafePath(url.pathname);
    const file = Bun.file(DIST_FOLDER + safePath);

    if (!file.exists) return new Response("404", { status: 404 });

    const contentType = getContentType(safePath);

    if (contentType === "text/html") {
      const body = await file.text();
      const liveReloadScript = makeHotReloadScript({
        wsUrl: `${request.headers.get("host")}${WS_HOT_RELOAD_URL}`,
        reloadCommand: RELOAD_COMMAND,
      });
      return new Response(
        body.replace("</body>", `${liveReloadScript}</body>`),
        {
          headers: {
            "content-type": contentType,
          },
        }
      );
    }

    return new Response(file, {
      headers: {
        "content-type": getContentType(safePath),
      },
    });
  })
  .onError(({ code }) => {
    if (code === "NOT_FOUND") return "Route not found :(";
  })
  .ws(WS_HOT_RELOAD_URL, {
    message(ws, message) {
      ws.publish(WS_HOT_RELOAD_CHANNEL, message);
    },
    open(ws) {
      ws.subscribe(WS_HOT_RELOAD_CHANNEL);
      console.log("⚡️ Hot Reload");
      startWatcher({ ws, baseUrl: app.server?.hostname! });
    },
  })
  .listen(process.env.PORT || 3000);

console.log(
  `🌿 Server is running at ${app.server?.hostname}:${app.server?.port}`
);
