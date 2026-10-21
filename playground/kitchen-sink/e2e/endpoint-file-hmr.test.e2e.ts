import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../../e2e/app-fixture';
import { HMR_MUTATION_ASSERT_TIMEOUT_MS } from './test-support';

const ENDPOINT_FILE = 'src/pages/api/v1/greetings/[name].api.ts';

test.describe('endpoint file reload @hmr', () => {
	let endpointFile: string | undefined;
	let original: string | undefined;

	test.afterEach(async ({ request }) => {
		if (!endpointFile || original === undefined) {
			return;
		}
		fs.writeFileSync(endpointFile, original, 'utf-8');
		await expect
			.poll(async () => (await (await request.get('/api/v1/greetings/ada')).json()).greeting, {
				timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
			})
			.toBe('Hello');
	});

	test('answers from the endpoint file and serves an edit without a restart', async ({ request, app }) => {
		endpointFile = path.join(app.dir, ENDPOINT_FILE);
		original = fs.readFileSync(endpointFile, 'utf-8');

		const first = await request.get('/api/v1/greetings/ada');
		expect(first.status()).toBe(200);
		expect(await first.json()).toEqual({ greeting: 'Hello', name: 'ada' });
		expect((await request.delete('/api/v1/greetings/ada')).headers()['allow']).toBe('GET');

		fs.writeFileSync(endpointFile, original.replace("greeting: 'Hello'", "greeting: 'Hi'"), 'utf-8');

		await expect
			.poll(async () => (await (await request.get('/api/v1/greetings/ada')).json()).greeting, {
				timeout: HMR_MUTATION_ASSERT_TIMEOUT_MS,
			})
			.toBe('Hi');
	});
});
