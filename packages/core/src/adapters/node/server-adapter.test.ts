import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { NodeServerAdapterParams } from './server-adapter.ts';
import { NodeServerAdapter } from './server-adapter.ts';

class TestNodeServerAdapter extends NodeServerAdapter {
	public setInitializedForTest(): void {
		(this as unknown as { initialized: boolean }).initialized = true;
	}

	public setHmrManagerForTest(hmrManager: { isEnabled: () => boolean } | null): void {
		(this as unknown as { hmrManager: { isEnabled: () => boolean } | null }).hmrManager = hmrManager;
	}

	public override async handleSharedRequest(): Promise<Response> {
		return new Response('<html><body><h1>Explicit route</h1></body></html>', {
			headers: { 'Content-Type': 'text/html' },
		});
	}
}

function createAdapter(options?: Partial<NodeServerAdapterParams>) {
	const appConfig = {
		rootDir: '/tmp/app',
		distDir: '.ecopages',
		runtime: {},
	} as unknown as EcoPagesAppConfig;

	return new TestNodeServerAdapter({
		appConfig,
		runtimeOrigin: 'http://localhost:3000',
		serveOptions: {},
		options: { watch: true },
		...options,
	});
}

describe('NodeServerAdapter', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('injects the HMR runtime into explicit HTML handler responses in watch mode', async () => {
		const adapter = createAdapter();
		adapter.setInitializedForTest();
		adapter.setHmrManagerForTest({ isEnabled: () => true });

		const response = await adapter.handleRequest(new Request('http://localhost:3000/explicit/team'));
		const html = await response.text();

		expect(html).toContain("import '/_hmr_runtime.js'");
		expect(response.headers.get('Cache-Control')).toBe('no-store, must-revalidate');
	});

	it('does not inject the HMR runtime when watch mode is disabled', async () => {
		const adapter = createAdapter({ options: { watch: false } });
		adapter.setInitializedForTest();
		adapter.setHmrManagerForTest({ isEnabled: () => true });

		const response = await adapter.handleRequest(new Request('http://localhost:3000/explicit/team'));
		const html = await response.text();

		expect(html).not.toContain("import '/_hmr_runtime.js'");
	});
});
