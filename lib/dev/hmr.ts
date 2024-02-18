import type { Server, ServerWebSocket, WebSocketHandler, WebSocketServeOptions } from "bun";
import { watch } from "fs";
import type { EcoPagesConfig } from "../eco-pages.types";

declare global {
  var ws: ServerWebSocket<unknown> | undefined;
}

const reloadCommand = "reload";

globalThis.ws?.send(reloadCommand);

const makeLiveReloadScript = (wsUrl: string) => `
<!-- [eco-pages] live reload start script -->
<script type="text/javascript">
  (function() {
    const socket = new WebSocket("ws://${wsUrl}");
      socket.onmessage = function(msg) {
      if(msg.data === '${reloadCommand}') {
        location.reload()
      }
      socket.onerror = function(error) {
        console.error('Live reload connection error.',{error});
      }
    };
    console.log('[eco-pages] Live reload enabled');
  })();
</script>
<!-- [eco-pages] live reload end script -->
`;

export type PureWebSocketServeOptions<WebSocketDataType> = Omit<
  WebSocketServeOptions<WebSocketDataType>,
  "fetch" | "websocket"
> & {
  fetch(request: Request, server: Server): Promise<Response> | Response;
  websocket?: WebSocketHandler<WebSocketDataType>;
};

const WS_PATH = "__bun_live_reload_websocket__";

export const withHtmlLiveReload = <
  WebSocketDataType,
  T extends PureWebSocketServeOptions<WebSocketDataType>
>(
  serveOptions: T,
  config: EcoPagesConfig
): WebSocketServeOptions<WebSocketDataType> => {
  const watcher = watch(config.distDir, { recursive: true });

  return {
    ...serveOptions,
    fetch: async (req, server) => {
      const wsUrl = `${server.hostname}:${server.port}/${WS_PATH}`;
      if (req.url === `http://${wsUrl}`) {
        const upgraded = server.upgrade(req);

        if (!upgraded) {
          return new Response("Failed to upgrade websocket connection for live reload", {
            status: 400,
          });
        }
        return;
      }

      const response = await serveOptions.fetch(req, server);

      if (!response.headers.get("Content-Type")?.startsWith("text/html")) {
        return response;
      }

      const closingTags = "</body></html>";
      const originalHtml = await response.text();
      const liveReloadScript = makeLiveReloadScript(wsUrl);
      const htmlWithLiveReload =
        originalHtml.replace(closingTags, "") + liveReloadScript + closingTags;

      return new Response(htmlWithLiveReload, response);
    },
    websocket: {
      ...serveOptions.websocket,
      open: async (ws) => {
        globalThis.ws = ws;
        await serveOptions.websocket?.open?.(ws);

        if (watcher) {
          watcher.once("change", async () => {
            ws.send(reloadCommand);
          });
        }
      },
    },
  };
};
