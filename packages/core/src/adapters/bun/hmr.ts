import { watch } from 'node:fs';
import type { EcoPagesConfig } from '@types';
import type { Server, ServerWebSocket, WebSocketHandler, WebSocketServeOptions } from 'bun';

declare global {
  var __ECO_PAGES_HMR_WS__: ServerWebSocket<unknown> | undefined;
}

export const reloadCommand = 'reload';

globalThis.__ECO_PAGES_HMR_WS__?.send(reloadCommand);

const makeLiveReloadScript = (wsUrl: string) => `
<!-- [ecopages] live reload start script -->
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
    console.log('[ecopages] Live reload enabled');
  })();
</script>
<!-- [ecopages] live reload end script -->
`;

export type PureWebSocketServeOptions<WebSocketDataType> = Omit<
  WebSocketServeOptions<WebSocketDataType>,
  'fetch' | 'websocket'
> & {
  fetch(request: Request, server: Server): Promise<Response> | Response;
  websocket?: WebSocketHandler<WebSocketDataType>;
};

const WS_PATH = '__ecopages_live_reload_websocket__';

/**
 * @function withHtmlLiveReload
 * @description
 * This function returns the serve options with live reload.
 * It will add the live reload script to the html pages.
 * @param {PureWebSocketServeOptions} serveOptions
 * @param {EcoPagesConfig} config
 */
export const withHtmlLiveReload = <WebSocketDataType, T extends PureWebSocketServeOptions<WebSocketDataType>>(
  serveOptions: T,
  config: EcoPagesConfig,
): WebSocketServeOptions<WebSocketDataType> => {
  const watcher = watch(config.absolutePaths.srcDir, { recursive: true });

  return {
    ...serveOptions,
    fetch: async (req, server) => {
      const wsUrl = `${server.hostname}:${server.port}/${WS_PATH}`;
      if (req.url === `http://${wsUrl}`) {
        const upgraded = server.upgrade(req);

        if (!upgraded) {
          return new Response('Failed to upgrade websocket connection for live reload', {
            status: 400,
          });
        }
        return;
      }

      const response = await serveOptions.fetch(req, server);

      if (!response.headers.get('Content-Type')?.startsWith('text/html')) {
        return response;
      }

      const closingTags = '</body></html>';
      const originalHtml = await response.text();
      const liveReloadScript = makeLiveReloadScript(wsUrl);
      const htmlWithLiveReload = originalHtml.replace(closingTags, '') + liveReloadScript + closingTags;

      return new Response(htmlWithLiveReload, response);
    },
    websocket: {
      ...serveOptions.websocket,
      open: async (ws) => {
        globalThis.__ECO_PAGES_HMR_WS__ = ws;
        await serveOptions.websocket?.open?.(ws);
        if (watcher) {
          watcher.removeAllListeners('change');
          watcher.once('change', async (r) => {
            ws.send(reloadCommand);
          });
        }
      },
    },
  };
};
