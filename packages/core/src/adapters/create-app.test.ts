import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './create-app.ts';
import { BunEcopagesApp } from './bun/create-app.ts';
import { NodeEcopagesApp } from './node/create-app.ts';

describe('createApp', () => {
	const originalArgv = [...process.argv];

	afterEach(() => {
		process.argv = [...originalArgv];
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it('leaves NODE_ENV alone for an embedded runtime, as the adapter does', async () => {
		process.argv = ['node', '/app/vite.js'];
		vi.stubEnv('NODE_ENV', 'development');

		await using app = await createApp({ appConfig: {} as never, adapter: 'node', runtime: { embedded: true } });

		expect(app).toBeInstanceOf(NodeEcopagesApp);
		expect(process.env.NODE_ENV).toBe('development');
	});

	it('falls back to Node adapter when Bun is not available', async () => {
		await using app = await createApp({ appConfig: {} as never });
		expect(app).toBeDefined();
		expect(typeof app.fetch).toBe('function');
	});

	it('uses the Node adapter when explicitly requested', async () => {
		await using app = await createApp({ appConfig: {} as never, adapter: 'node' });
		expect(app).toBeInstanceOf(NodeEcopagesApp);
	});

	it('uses the Bun adapter when explicitly requested', async () => {
		await using app = await createApp({ appConfig: {} as never, adapter: 'bun' });
		expect(app).toBeInstanceOf(BunEcopagesApp);
	});
});
