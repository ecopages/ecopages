/** fork from https://github.com/aabccd021/bun-html-live-reload/blob/main/index.ts */
import { watch } from 'node:fs';
import type { Server, ServerWebSocket, WebSocketHandler, WebSocketServeOptions } from 'bun';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import { html } from '../../utils/html.ts';

let ECO_PAGES_HMR_WS: ServerWebSocket<unknown> | undefined;

export const HMR_RELOAD_EVENT = 'ecopages:reload';

if (ECO_PAGES_HMR_WS) ECO_PAGES_HMR_WS.send(HMR_RELOAD_EVENT);

export function hmrServerReload() {
  if (ECO_PAGES_HMR_WS) ECO_PAGES_HMR_WS.send(HMR_RELOAD_EVENT);
}

export const WS_PATH = '__ecopages_live_reload_websocket__';

/**
 * Creates the live reload script to be injected into the html
 */
export const makeLiveReloadScript = (): string => html`
<!-- [ecopages] live reload start script -->
<script type="text/javascript">
  (function() {
    const websocketUrl = 'ws://' + location.host + '/' + '${WS_PATH}';
     const socket = new WebSocket(websocketUrl);
      socket.onmessage = function(msg) {
      if(msg.data === '${HMR_RELOAD_EVENT}') {
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

/**
 * Append the live reload script to the html response
 * @param {Response} response
 * @param {string} liveReloadScript
 */
export function appendHmrScriptToBody(response: string, liveReloadScript: string): string {
  return new HTMLRewriter()
    .on('body', {
      element(body) {
        body.append(liveReloadScript, { html: true });
      },
    })
    .transform(response);
}

/**
 * @function withHtmlLiveReload
 * @description
 * This function returns the serve options with live reload.
 * It will add the live reload script to the html pages.
 * @param {PureWebSocketServeOptions} serveOptions
 * @param {EcoPagesAppConfig} config
 */
export const withHtmlLiveReload = <WebSocketDataType, T extends PureWebSocketServeOptions<WebSocketDataType>>(
  serveOptions: T,
  config: EcoPagesAppConfig,
): WebSocketServeOptions<WebSocketDataType> => {
  const watcher = watch(config.absolutePaths.srcDir, { recursive: true });

  return {
    ...serveOptions,
    fetch: async (req, server) => {
      const url = new URL(req.url);
      if (url.pathname === `/${WS_PATH}`) {
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

      const liveReloadScript = makeLiveReloadScript();

      const html = await response.text();
      const newHtml = appendHmrScriptToBody(html, liveReloadScript);
      return new Response(newHtml, response);
    },
    websocket: {
      ...serveOptions.websocket,
      open: async (ws) => {
        ECO_PAGES_HMR_WS = ws;
        await serveOptions.websocket?.open?.(ws);
        if (watcher) {
          watcher.removeAllListeners('change');
          watcher.on('change', async (r) => {
            ws.send(HMR_RELOAD_EVENT);
          });
        }
      },
    },
  };
};
