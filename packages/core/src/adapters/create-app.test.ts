import { describe, expect, it } from 'vitest';
import { createApp } from './create-app.ts';

describe('createApp', () => {
	it('falls back to Node adapter when Bun is not available', async () => {
		const app = await createApp({ appConfig: {} as never });
		expect(app).toBeDefined();
		expect(typeof app.fetch).toBe('function');
	});
});
