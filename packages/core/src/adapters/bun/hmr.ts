import { watch } from 'node:fs';
import type { Server, ServerWebSocket, WebSocketHandler, WebSocketServeOptions } from 'bun';
import { appLogger } from 'src/global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';

const ECO_PAGES_HMR_WS: Set<ServerWebSocket<unknown>> = new Set();

export const HMR_EVENTS = {
  RELOAD: 'ecopages:reload',
  ERROR: 'ecopages:error',
} as const;

export type HMRPayload = {
  type: keyof typeof HMR_EVENTS;
  path?: string;
  message?: string;
  timestamp: number;
};

export function hmrServerReload(path?: string): void {
  if (ECO_PAGES_HMR_WS.size === 0) return;

  const payload: HMRPayload = {
    type: 'RELOAD',
    path,
    timestamp: Date.now(),
  };

  const message = JSON.stringify(payload);
  for (const ws of ECO_PAGES_HMR_WS) {
    try {
      if (ws.readyState === 1) {
        ws.send(message);
      } else {
        ECO_PAGES_HMR_WS.delete(ws);
      }
    } catch (error) {
      console.error('[ecopages] Failed to send HMR reload message:', error);
      ECO_PAGES_HMR_WS.delete(ws);
    }
  }
}

export function hmrServerError(error: Error): void {
  if (ECO_PAGES_HMR_WS.size === 0) return;

  const payload: HMRPayload = {
    type: 'ERROR',
    message: error.message,
    timestamp: Date.now(),
  };

  const message = JSON.stringify(payload);
  for (const ws of ECO_PAGES_HMR_WS) {
    try {
      if (ws.readyState === 1) {
        ws.send(message);
      } else {
        ECO_PAGES_HMR_WS.delete(ws);
      }
    } catch (error) {
      console.error('[ecopages] Failed to send HMR error message:', error);
      ECO_PAGES_HMR_WS.delete(ws);
    }
  }
}

export const WS_PATH = '__ecopages_live_reload_websocket__';

/**
 * Creates the live reload script to be injected into the html
 */
export const makeLiveReloadScript = (): string => {
  return `
<!-- [ecopages] live reload start script -->
<script type="text/javascript">
(function() {
  const HMR_EVENTS = ${JSON.stringify(HMR_EVENTS)};
  let isConnected = false;
  let retryCount = 0;
  const MAX_RETRIES = 10;
  let socket = null;
  
  function cleanup() {
    if (socket) {
      socket.close();
      socket = null;
    }
  }
  
  function connect() {
    cleanup();
    
    const websocketUrl = 'ws://' + location.host + '/' + '${WS_PATH}';
    socket = new WebSocket(websocketUrl);
    
    socket.onmessage = function(event) {
      try {
        const payload = JSON.parse(event.data);
        
        switch(payload.type) {
          case 'RELOAD':
            console.log('[ecopages] Hot reload triggered' + (payload.path ? ' for: ' + payload.path : ''));
            location.reload();
            break;
            
          case 'ERROR':
            console.error('[ecopages] Hot reload error:', payload.message);
            break;

          default:
            console.warn('[ecopages] Unknown HMR event:', payload.type);
            break;
        }
      } catch (err) {
        console.error('[ecopages] Failed to parse HMR message:', err);
      }
    };

    socket.onopen = function() {
      console.log('[ecopages] HMR client connected');
      isConnected = true;
      retryCount = 0;
    };

    socket.onclose = function(event) {
      isConnected = false;
      cleanup();
      
      if (retryCount < MAX_RETRIES && !event.wasClean) {
        const timeout = Math.min(1000 * Math.pow(2, retryCount), 30000);
        console.log('[ecopages] Connection lost. Retrying in ' + timeout + 'ms... (attempt ' + (retryCount + 1) + '/' + MAX_RETRIES + ')');
        setTimeout(connect, timeout);
        retryCount++;
      } else if (retryCount >= MAX_RETRIES) {
        console.warn('[ecopages] Max retry attempts reached. Please refresh the page to reconnect HMR.');
      }
    };

    socket.onerror = function(error) {
      console.error('[ecopages] HMR connection error:', error);
    };
  }

  // Handle page visibility changes to reconnect when page becomes visible
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden && !isConnected && retryCount < MAX_RETRIES) {
      console.log('[ecopages] Page became visible, attempting to reconnect HMR...');
      retryCount = 0; // Reset retry count on manual reconnect
      connect();
    }
  });

  // Handle window focus to reconnect
  window.addEventListener('focus', function() {
    if (!isConnected && retryCount < MAX_RETRIES) {
      console.log('[ecopages] Window focused, attempting to reconnect HMR...');
      retryCount = 0; // Reset retry count on manual reconnect
      connect();
    }
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);

  connect();
})();
</script>
<!-- [ecopages] live reload end script -->
`;
};

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
        ECO_PAGES_HMR_WS.add(ws);
        appLogger.debug(`[ecopages] HMR client connected. Total connections: ${ECO_PAGES_HMR_WS.size}`);

        await serveOptions.websocket?.open?.(ws);

        if (watcher) {
          watcher.removeAllListeners('change');
          watcher.on('change', async (path) => {
            hmrServerReload(path);
          });
        }
      },
      close: async (ws, code, message) => {
        ECO_PAGES_HMR_WS.delete(ws);
        appLogger.debug(`[ecopages] HMR client disconnected. Total connections: ${ECO_PAGES_HMR_WS.size}`);
        await serveOptions.websocket?.close?.(ws, code, message);
      },
      message: async (ws, message) => {
        await serveOptions.websocket?.message?.(ws, message);
      },
    },
  };
};
