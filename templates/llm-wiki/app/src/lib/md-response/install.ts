import type { MarkdownNegotiation } from './try-response';
import { tryMarkdownResponse } from './try-response';

type HandleRequestHost = {
	handleRequest: (request: Request) => Promise<Response>;
};

type AppWithServerAdapter = {
	fetch: (request: Request) => Promise<Response>;
	serverAdapter?: HandleRequestHost;
};

/**
 * Installs same-URL markdown negotiation in front of HTML page rendering.
 *
 * @remarks
 * Ecopages API middleware cannot fall through to HTML pages, so this patches
 * `serverAdapter.handleRequest` after forcing adapter init via `fetch`. Call
 * once after `createApp` / `app.add(...)` and before `app.start()`.
 */
export async function installMarkdownNegotiation(
	app: AppWithServerAdapter,
	negotiation: MarkdownNegotiation,
): Promise<void> {
	await app.fetch(new Request('http://127.0.0.1/.well-known/md-response-install'));

	const adapter = app.serverAdapter;
	if (!adapter?.handleRequest) {
		throw new Error('Markdown negotiation requires a server adapter with handleRequest');
	}

	const originalHandleRequest = adapter.handleRequest.bind(adapter);
	adapter.handleRequest = async (request: Request) => {
		const response = await tryMarkdownResponse(request, negotiation);
		if (response) {
			return response;
		}
		return originalHandleRequest(request);
	};
}
