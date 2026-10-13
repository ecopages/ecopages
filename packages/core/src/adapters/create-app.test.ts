import { describe, expect, it } from 'vitest';
import { createApp } from './create-app.ts';
import { NodeEcopagesApp } from './node/create-app.ts';

describe('createApp', () => {
	it('creates the Node host', async () => {
		await using app = await createApp({ appConfig: {} as never });
		expect(app).toBeInstanceOf(NodeEcopagesApp);
		expect(typeof app.fetch).toBe('function');
	});
});
