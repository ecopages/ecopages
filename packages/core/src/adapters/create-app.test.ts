import { describe, expect, it } from 'vitest';
import { createApp } from './create-app.ts';
import { BunEcopagesApp } from './bun/create-app.ts';
import { NodeEcopagesApp } from './node/create-app.ts';

describe('createApp', () => {
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
