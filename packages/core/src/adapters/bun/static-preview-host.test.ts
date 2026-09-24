import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { BunStaticPreviewHost } from './static-preview-host.ts';

type StubServeOptions = { port: number; hostname?: string; fetch: (request: Request) => Promise<Response> };

describe('BunStaticPreviewHost', () => {
	let distDir: string;
	let serve: ReturnType<typeof vi.fn<(options: StubServeOptions) => { port: number; stop: () => void }>>;

	beforeEach(() => {
		distDir = mkdtempSync(path.join(tmpdir(), 'eco-bun-preview-'));
		serve = vi.fn((options: StubServeOptions) => ({ port: options.port, stop: vi.fn() }));
		vi.stubGlobal('Bun', { serve });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		rmSync(distDir, { recursive: true, force: true });
	});

	async function startPreview() {
		const port = await new BunStaticPreviewHost().start({
			appConfig: { absolutePaths: { distDir } } as EcoPagesAppConfig,
			hostname: '127.0.0.1',
			port: 4173,
		});
		return { port, options: serve.mock.calls[0][0] };
	}

	it('binds the configured hostname', async () => {
		const { port, options } = await startPreview();

		expect(port).toBe(4173);
		expect(options).toMatchObject({ hostname: '127.0.0.1', port: 4173 });
	});

	it('answers unknown paths with 404, serving 404.html when it exists', async () => {
		const { options } = await startPreview();

		const fallback = await options.fetch(new Request('http://127.0.0.1:4173/missing'));
		expect(fallback.status).toBe(404);

		writeFileSync(path.join(distDir, '404.html'), '<h1>Not here</h1>');
		const page = await options.fetch(new Request('http://127.0.0.1:4173/missing'));
		expect(page.status).toBe(404);
		expect(await page.text()).toBe('<h1>Not here</h1>');
	});
});
