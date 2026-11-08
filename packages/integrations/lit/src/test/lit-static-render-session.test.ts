import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LitStaticRenderSession } from '../lit-static-render-session.ts';

const workerStart = vi.fn(async () => {});
const workerRenderPage = vi.fn(async () => ({
	html: '<html>Lit worker</html>',
	cacheStrategy: { revalidate: 60 },
	metadata: { title: 'Page', description: 'Page description' },
}));
const workerDispose = vi.fn(async () => {});

const createWorkerClient = () => ({
	start: workerStart,
	renderPage: workerRenderPage,
	dispose: workerDispose,
});

describe('LitStaticRenderSession', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('starts the render worker and forwards page data', async () => {
		const session = new LitStaticRenderSession({
			createWorkerClient,
		});

		await session.ensureWorker({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:3000',
			directories: { distDir: '/app/dist', workDir: '/app/.eco' },
		});

		expect(workerStart).toHaveBeenCalledTimes(1);

		const result = await session.renderPageInWorker({
			filePath: '/app/src/pages/integration-matrix/lit-entry.lit.tsx',
			params: {},
			query: { preview: '1' },
		});
		expect(workerRenderPage).toHaveBeenCalledWith({
			filePath: '/app/src/pages/integration-matrix/lit-entry.lit.tsx',
			params: {},
			query: { preview: '1' },
		});
		expect(result).toEqual({
			html: '<html>Lit worker</html>',
			cacheStrategy: { revalidate: 60 },
			metadata: { title: 'Page', description: 'Page description' },
		});

		await session.dispose();
		expect(workerDispose).toHaveBeenCalledTimes(1);
	});

	it('recreates the worker when init identity changes', async () => {
		workerStart.mockClear();
		workerDispose.mockClear();

		const createClient = vi.fn(() => createWorkerClient());
		const session = new LitStaticRenderSession({
			createWorkerClient: createClient,
		});

		await session.ensureWorker({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:3000',
			directories: { distDir: '/app/dist', workDir: '/app/.eco' },
		});
		await session.ensureWorker({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:3000',
			directories: { distDir: '/app/dist', workDir: '/app/.eco' },
		});

		expect(createClient).toHaveBeenCalledTimes(1);
		expect(workerStart).toHaveBeenCalledTimes(1);

		await session.ensureWorker({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:4000',
			directories: { distDir: '/app/dist', workDir: '/app/.eco' },
		});

		expect(workerDispose).toHaveBeenCalledTimes(1);
		expect(createClient).toHaveBeenCalledTimes(2);
		expect(workerStart).toHaveBeenCalledTimes(2);
		expect(createClient).toHaveBeenLastCalledWith({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:4000',
			directories: { distDir: '/app/dist', workDir: '/app/.eco' },
		});

		await session.dispose();
	});

	it('forwards array PageParams and PageQuery to the worker client', async () => {
		workerRenderPage.mockClear();

		const session = new LitStaticRenderSession({
			createWorkerClient,
		});

		await session.ensureWorker({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://127.0.0.1:3000',
			directories: { distDir: '/app/dist', workDir: '/app/.eco' },
		});

		await session.renderPageInWorker({
			filePath: '/app/src/pages/catch-all.lit.tsx',
			params: { slug: ['docs', 'intro'] },
			query: { tag: ['a', 'b'], preview: '1' },
		});

		expect(workerRenderPage).toHaveBeenCalledWith({
			filePath: '/app/src/pages/catch-all.lit.tsx',
			params: { slug: ['docs', 'intro'] },
			query: { tag: ['a', 'b'], preview: '1' },
		});

		await session.dispose();
	});

	it('restarts once after source invalidation and serializes concurrent renders', async () => {
		let version = 0;
		const dispose = vi.fn(async () => {});
		const renderPage = vi.fn(async () => ({
			html: '<main />',
			metadata: { title: 'Page', description: 'Page description' },
		}));
		const createClient = vi.fn(() => ({ start: async () => {}, dispose, renderPage }));
		const session = new LitStaticRenderSession({
			createWorkerClient: createClient,
			getInvalidationVersion: () => version,
		});
		await session.ensureWorker({
			configModulePath: '/app/eco.config.ts',
			runtimeOrigin: 'http://localhost',
			directories: { distDir: '/app/dist', workDir: '/app/.eco' },
		});
		await session.renderPageInWorker({ filePath: '/app/page.lit.tsx', params: {} });
		version += 1;
		await Promise.all([
			session.renderPageInWorker({ filePath: '/app/page.lit.tsx', params: {} }),
			session.renderPageInWorker({ filePath: '/app/other.lit.tsx', params: {} }),
		]);
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(createClient).toHaveBeenCalledTimes(2);
		expect(renderPage).toHaveBeenCalledTimes(3);
		await session.dispose();
	});
});
