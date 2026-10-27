import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '@ecopages/core/create-app';
import type { EcopagesApp } from '@ecopages/core/create-app';

const ORIGIN = 'http://localhost:3000';
const FIXTURE_SOURCE = fileURLToPath(new URL('./fixtures/mixed-server-dom-app', import.meta.url));
const WORKSPACE_NODE_MODULES = fileURLToPath(
	new URL('../../../../../playground/kitchen-sink/node_modules', import.meta.url),
);

const appDir = mkdtempSync(path.join(tmpdir(), 'eco-mixed-server-dom-'));
cpSync(FIXTURE_SOURCE, appDir, { recursive: true });
symlinkSync(WORKSPACE_NODE_MODULES, path.join(appDir, 'node_modules'), 'dir');

let app: EcopagesApp;

async function requestPage(pathname: string): Promise<{ status: number; html: string }> {
	const response = await app.fetch(new Request(`${ORIGIN}${pathname}`));
	return { status: response.status, html: await response.text() };
}

beforeAll(async () => {
	app = await createApp({
		configFile: path.join(appDir, 'eco.config.ts'),
		serverOptions: { hostname: '127.0.0.1', port: 0 },
	});
}, 60_000);

afterAll(async () => {
	try {
		await app?.stop();
	} finally {
		rmSync(appDir, { recursive: true, force: true });
	}
});

describe('server DOM across Lit and Radiant', () => {
	it('A Lit component keeps rendering after a Radiant element', async () => {
		const first = await requestPage('/kita-with-lit');
		expect(first.status).toBe(200);
		expect(first.html).toContain('Kita with Lit');
		expect(first.html).toContain('server-dom-lit-probe');
		expect(first.html).toContain('<template shadowrootmode="open">');
		expect(first.html).toContain('data-server-dom-lit-probe');

		const radiantPage = await requestPage('/jsx-with-radiant');
		expect(radiantPage.status).toBe(200);
		expect(radiantPage.html).toContain('data-server-dom-radiant-probe');

		const third = await requestPage('/kita-with-lit');
		expect(third.status).toBe(200);
		expect(third.html).toContain('<template shadowrootmode="open">');
		expect(third.html).toContain('data-server-dom-lit-probe');
	}, 60_000);

	it('renders a Lit Page with a Radiant child and a JSX Page with a Lit child in either request order, repeated and concurrently', async () => {
		const assertLitWithRadiant = (html: string) => {
			expect(html).toContain('data-server-dom-radiant-probe');
		};
		const assertJsxWithLit = (html: string) => {
			expect(html).toContain('<template shadowrootmode="open">');
			expect(html).toContain('data-server-dom-lit-probe');
		};

		const litFirst = await requestPage('/lit-with-radiant');
		expect(litFirst.status).toBe(200);
		assertLitWithRadiant(litFirst.html);

		const jsxSecond = await requestPage('/jsx-with-lit');
		expect(jsxSecond.status).toBe(200);
		assertJsxWithLit(jsxSecond.html);

		const jsxAgain = await requestPage('/jsx-with-lit');
		expect(jsxAgain.status).toBe(200);
		assertJsxWithLit(jsxAgain.html);

		const litAgain = await requestPage('/lit-with-radiant');
		expect(litAgain.status).toBe(200);
		assertLitWithRadiant(litAgain.html);

		const concurrent = await Promise.all([
			requestPage('/lit-with-radiant'),
			requestPage('/jsx-with-lit'),
			requestPage('/kita-with-lit'),
			requestPage('/jsx-with-radiant'),
			requestPage('/lit-with-locals'),
		]);

		for (const response of concurrent) {
			expect(response.status).toBe(200);
		}
		assertLitWithRadiant(concurrent[0].html);
		assertJsxWithLit(concurrent[1].html);
		expect(concurrent[2].html).toContain('data-server-dom-lit-probe');
		expect(concurrent[2].html).toContain('<template shadowrootmode="open">');
		expect(concurrent[3].html).toContain('data-server-dom-radiant-probe');
		expect(concurrent[4].html).toContain('data-viewer');
		expect(concurrent[4].html).toContain('ada');
		expect(concurrent[4].html).toContain('data-server-dom-lit-probe');
		expect(concurrent[4].html).toContain('<template shadowrootmode="open">');
	}, 60_000);
});
