import { describe, expect, it } from 'vitest';
import {
	DefaultHtmlRewriterProvider,
	type HtmlRewriterElement,
	type HtmlRewriterLogger,
	type HtmlRewriterRuntime,
} from './html-rewriter-provider.service';

type HtmlRewriterHandler = {
	element: (element: HtmlRewriterElement) => void;
};

class TestHtmlRewriter implements HtmlRewriterRuntime {
	private handlers = new Map<'head' | 'body', HtmlRewriterHandler>();

	on(selector: 'head' | 'body', handler: HtmlRewriterHandler): TestHtmlRewriter {
		this.handlers.set(selector, handler);
		return this;
	}

	transform(response: Response): Response {
		return response;
	}
}

class TestLogger implements HtmlRewriterLogger {
	public warnings: string[] = [];

	warn(message: string) {
		this.warnings.push(message);
	}
}

describe('DefaultHtmlRewriterProvider', () => {
	it('should prefer the native html rewriter in auto mode', async () => {
		let workerToolsLoads = 0;

		const provider = new DefaultHtmlRewriterProvider({
			getNativeHtmlRewriter: () => TestHtmlRewriter,
			loadWorkerToolsHtmlRewriter: async () => {
				workerToolsLoads += 1;
				return TestHtmlRewriter;
			},
		});

		const htmlRewriter = await provider.createHtmlRewriter();

		expect(htmlRewriter).toBeInstanceOf(TestHtmlRewriter);
		expect(workerToolsLoads).toBe(0);
	});

	it('should load worker-tools when auto mode has no native runtime', async () => {
		let workerToolsLoads = 0;

		const provider = new DefaultHtmlRewriterProvider({
			getNativeHtmlRewriter: () => undefined,
			loadWorkerToolsHtmlRewriter: async () => {
				workerToolsLoads += 1;
				return TestHtmlRewriter;
			},
		});

		const htmlRewriter = await provider.createHtmlRewriter();

		expect(htmlRewriter).toBeInstanceOf(TestHtmlRewriter);
		expect(workerToolsLoads).toBe(1);
	});

	it('should allow forcing worker-tools mode even when native is available', async () => {
		let workerToolsLoads = 0;

		const provider = new DefaultHtmlRewriterProvider({
			mode: 'worker-tools',
			getNativeHtmlRewriter: () => TestHtmlRewriter,
			loadWorkerToolsHtmlRewriter: async () => {
				workerToolsLoads += 1;
				return TestHtmlRewriter;
			},
		});

		const htmlRewriter = await provider.createHtmlRewriter();

		expect(htmlRewriter).toBeInstanceOf(TestHtmlRewriter);
		expect(workerToolsLoads).toBe(1);
	});

	it('should allow forcing fallback mode', async () => {
		let workerToolsLoads = 0;

		const provider = new DefaultHtmlRewriterProvider({
			mode: 'fallback',
			getNativeHtmlRewriter: () => TestHtmlRewriter,
			loadWorkerToolsHtmlRewriter: async () => {
				workerToolsLoads += 1;
				return TestHtmlRewriter;
			},
		});

		const htmlRewriter = await provider.createHtmlRewriter();

		expect(htmlRewriter).toBeNull();
		expect(workerToolsLoads).toBe(0);
	});

	it('should warn and fall back when native mode is forced without a runtime implementation', async () => {
		const logger = new TestLogger();

		const provider = new DefaultHtmlRewriterProvider({
			mode: 'native',
			logger,
			getNativeHtmlRewriter: () => undefined,
		});

		const htmlRewriter = await provider.createHtmlRewriter();

		expect(htmlRewriter).toBeNull();
		expect(logger.warnings).toEqual([
			'[HtmlTransformerService] Native HTMLRewriter was forced but is unavailable, falling back to string injection.',
		]);
	});

	it('should reset the cached constructor when the mode changes', async () => {
		let workerToolsLoads = 0;

		const provider = new DefaultHtmlRewriterProvider({
			getNativeHtmlRewriter: () => undefined,
			loadWorkerToolsHtmlRewriter: async () => {
				workerToolsLoads += 1;
				return TestHtmlRewriter;
			},
		});

		await provider.createHtmlRewriter();
		await provider.createHtmlRewriter();
		provider.setMode('fallback');
		const fallbackHtmlRewriter = await provider.createHtmlRewriter();

		expect(workerToolsLoads).toBe(1);
		expect(fallbackHtmlRewriter).toBeNull();
	});

	it('should allow switching back to worker-tools after fallback mode', async () => {
		let workerToolsLoads = 0;

		const provider = new DefaultHtmlRewriterProvider({
			mode: 'fallback',
			getNativeHtmlRewriter: () => undefined,
			loadWorkerToolsHtmlRewriter: async () => {
				workerToolsLoads += 1;
				return TestHtmlRewriter;
			},
		});

		await provider.createHtmlRewriter();
		provider.setMode('worker-tools');
		const htmlRewriter = await provider.createHtmlRewriter();

		expect(htmlRewriter).toBeInstanceOf(TestHtmlRewriter);
		expect(workerToolsLoads).toBe(1);
	});

	it('should return null when worker-tools loading fails', async () => {
		const logger = new TestLogger();

		const provider = new DefaultHtmlRewriterProvider({
			logger,
			getNativeHtmlRewriter: () => undefined,
			loadWorkerToolsHtmlRewriter: async () => {
				logger.warn(
					'[HtmlTransformerService] Failed to load @worker-tools/html-rewriter/base64, falling back to string injection: test failure',
				);
				return null;
			},
		});

		const htmlRewriter = await provider.createHtmlRewriter();

		expect(htmlRewriter).toBeNull();
		expect(logger.warnings).toEqual([
			'[HtmlTransformerService] Failed to load @worker-tools/html-rewriter/base64, falling back to string injection: test failure',
		]);
	});
});
