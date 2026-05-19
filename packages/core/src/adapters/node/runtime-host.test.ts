import { afterEach, describe, expect, it, vi } from 'vitest';
import { appLogger } from '../../global/app-logger.ts';
import { NodeClientAbortError } from './http-request-bridge.ts';
import { NodeRuntimeHost } from './runtime-host.ts';

describe('NodeRuntimeHost', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('does not log or report client aborts raised while sending the response', async () => {
		let requestHandler:
			| ((req: unknown, res: { statusCode: number; end: ReturnType<typeof vi.fn> }) => Promise<void>)
			| undefined;

		const requestBridge = {
			createWebRequest: vi.fn().mockReturnValue(new Request('http://localhost:3000')),
			sendNodeResponse: vi.fn().mockRejectedValue(new NodeClientAbortError()),
		};
		const serverFactory = vi.fn().mockImplementation((handler) => {
			requestHandler = handler;
			return {
				listen: (_port: number, _hostname: string, callback: () => void) => callback(),
				close: (_callback: (error?: Error | null) => void) => undefined,
				closeAllConnections: () => undefined,
				address: () => ({ address: '127.0.0.1', port: 3000, family: 'IPv4' }),
			};
		});
		const onError = vi.fn();
		const loggerSpy = vi.spyOn(appLogger, 'error');
		const host = new NodeRuntimeHost(requestBridge as never, serverFactory as never);

		await host.start({
			serveOptions: {
				hostname: 'localhost',
				port: 3000,
			},
			handleRequest: async () => new Response('ok'),
			onError,
		});

		const res = { statusCode: 200, end: vi.fn() };
		await requestHandler?.({ url: '/', method: 'GET', headers: {} }, res);

		expect(loggerSpy).not.toHaveBeenCalled();
		expect(res.end).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
	});
});
