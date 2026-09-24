import type { Server } from 'bun';
import { describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { ErrorHandler } from '../../types/public-types.ts';
import type { ClientBridge } from './client-bridge.ts';
import type { HmrManager } from './hmr-manager.ts';
import { BunServerAdapter } from './server-adapter.ts';

class TestBunServerAdapter extends BunServerAdapter {
	public handleSharedRequestImpl: () => Promise<Response> = async () => new Response('ok');

	public markInitializedForTest(): void {
		(this as unknown as { fullyInitialized: boolean }).fullyInitialized = true;
	}

	public override async handleSharedRequest(): Promise<Response> {
		return await this.handleSharedRequestImpl();
	}
}

function createAdapter(errorHandler?: ErrorHandler) {
	const adapter = new TestBunServerAdapter({
		appConfig: { rootDir: '/tmp/app', runtime: {} } as unknown as EcoPagesAppConfig,
		runtimeOrigin: 'http://localhost:3000',
		serveOptions: {},
		errorHandler,
		hmrManager: {} as HmrManager,
		bridge: {} as ClientBridge,
		previewHost: { start: async () => null, stop: async () => {} },
	});
	adapter.markInitializedForTest();
	adapter.handleSharedRequestImpl = async () => {
		throw new Error('boom');
	};
	return adapter;
}

describe('BunServerAdapter error handling', () => {
	it('routes errors that escape the request pipeline through app.onError', async () => {
		const errorHandler = vi.fn(async () => new Response('handled', { status: 418 }));

		const response = await createAdapter(errorHandler).handleRequest(new Request('http://localhost:3000/page'));

		expect(response.status).toBe(418);
		expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), expect.anything());
	});

	it('answers Bun error-hook failures with 500 instead of the not-found page', async () => {
		const serveOptions = createAdapter().getServerOptions();

		const response = await serveOptions.error!.call({} as Server<unknown>, new Error('boom'));

		expect(response).toBeInstanceOf(Response);
		expect((response as Response).status).toBe(500);
	});
});
