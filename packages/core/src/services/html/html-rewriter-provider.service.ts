import { appLogger } from '../../global/app-logger.ts';

export type HtmlRewriterElement = {
	append(content: string, options?: { html?: boolean }): void;
};

export type HtmlRewriterRuntime = {
	on(selector: 'head' | 'body', handler: { element: (element: HtmlRewriterElement) => void }): HtmlRewriterRuntime;
	transform(response: Response): Response;
};

export type HtmlRewriterConstructor = new () => HtmlRewriterRuntime;

export type HtmlRewriterMode = 'auto' | 'native' | 'worker-tools' | 'fallback';

export interface HtmlRewriterProvider {
	createHtmlRewriter(): Promise<HtmlRewriterRuntime | null>;
	setMode(mode: HtmlRewriterMode): void;
}

export interface HtmlRewriterLogger {
	warn(message: string): void;
}

export interface DefaultHtmlRewriterProviderOptions {
	mode?: HtmlRewriterMode;
	logger?: HtmlRewriterLogger;
	getNativeHtmlRewriter?: () => HtmlRewriterConstructor | undefined;
	loadWorkerToolsHtmlRewriter?: () => Promise<HtmlRewriterConstructor | null>;
}

export class DefaultHtmlRewriterProvider implements HtmlRewriterProvider {
	private htmlRewriterConstructorPromise?: Promise<HtmlRewriterConstructor | null>;
	private htmlRewriterMode: HtmlRewriterMode;
	private logger: HtmlRewriterLogger;
	private getNativeHtmlRewriter: () => HtmlRewriterConstructor | undefined;
	private loadWorkerToolsHtmlRewriter: () => Promise<HtmlRewriterConstructor | null>;

	constructor(options: DefaultHtmlRewriterProviderOptions = {}) {
		this.htmlRewriterMode = options.mode ?? 'auto';
		this.logger = options.logger ?? appLogger;
		this.getNativeHtmlRewriter =
			options.getNativeHtmlRewriter ??
			(() => (globalThis as { HTMLRewriter?: HtmlRewriterConstructor }).HTMLRewriter);
		this.loadWorkerToolsHtmlRewriter = options.loadWorkerToolsHtmlRewriter ?? loadWorkerToolsHtmlRewriter;
	}

	setMode(mode: HtmlRewriterMode) {
		this.htmlRewriterMode = mode;
		this.htmlRewriterConstructorPromise = undefined;
	}

	async createHtmlRewriter(): Promise<HtmlRewriterRuntime | null> {
		const RuntimeHtmlRewriter = await this.resolveHtmlRewriterConstructor();
		return RuntimeHtmlRewriter ? new RuntimeHtmlRewriter() : null;
	}

	private async resolveHtmlRewriterConstructor(): Promise<HtmlRewriterConstructor | null> {
		if (!this.htmlRewriterConstructorPromise) {
			const mode = this.htmlRewriterMode;
			const RuntimeHtmlRewriter = this.getNativeHtmlRewriter();

			if (mode === 'fallback') {
				this.htmlRewriterConstructorPromise = Promise.resolve(null);
			} else if (mode === 'native') {
				if (RuntimeHtmlRewriter) {
					this.htmlRewriterConstructorPromise = Promise.resolve(RuntimeHtmlRewriter);
				} else {
					this.logger.warn(
						'[HtmlTransformerService] Native HTMLRewriter was forced but is unavailable, falling back to string injection.',
					);
					this.htmlRewriterConstructorPromise = Promise.resolve(null);
				}
			} else if (mode === 'auto' && RuntimeHtmlRewriter) {
				this.htmlRewriterConstructorPromise = Promise.resolve(RuntimeHtmlRewriter);
			} else {
				this.htmlRewriterConstructorPromise = this.loadWorkerToolsHtmlRewriter();
			}
		}

		return this.htmlRewriterConstructorPromise;
	}
}

async function loadWorkerToolsHtmlRewriter(): Promise<HtmlRewriterConstructor | null> {
	try {
		const module = await import('@worker-tools/html-rewriter/base64');
		return module.HTMLRewriter as HtmlRewriterConstructor;
	} catch (primaryError) {
		try {
			const runtimeLocalModule = await import(
				new URL('../node_modules/@worker-tools/html-rewriter/base64.js', import.meta.url).href
			);
			return runtimeLocalModule.HTMLRewriter as HtmlRewriterConstructor;
		} catch {
			const message = primaryError instanceof Error ? primaryError.message : String(primaryError);
			appLogger.warn(
				`[HtmlTransformerService] Failed to load @worker-tools/html-rewriter/base64, falling back to string injection: ${message}`,
			);
			return null;
		}
	}
}
