import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationPlugin } from '../../../plugins/integration-plugin.ts';
import {
	IntegrationRenderer,
	type RenderToResponseContext,
} from '../../../route-renderer/orchestration/integration-renderer.ts';
import { FileScriptProcessor } from '../../../services/assets/asset-processing-service/processors/script/file-script.processor.ts';
import { FileStylesheetProcessor } from '../../../services/assets/asset-processing-service/processors/stylesheet/file-stylesheet.processor.ts';
import type {
	EcoComponent,
	EcoFunctionComponent,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
	RouteRendererOptions,
	RouteRenderResult,
} from '../../../types/public-types.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import { createRenderContext } from './render-context.ts';

class HandlerViewRenderer extends IntegrationRenderer {
	declare name: string;

	async render(_options: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
		return '';
	}

	async renderToResponse<P>(_view: EcoComponent<P>, _props: P, _ctx: RenderToResponseContext): Promise<Response> {
		return new Response('ok');
	}

	override async execute(options: RouteRendererOptions): Promise<RouteRenderResult> {
		const view = options.pageModule?.default;
		if (view) {
			await this.processComponentDependencies([view]);
		}
		return { body: 'ok' };
	}
}

class HandlerViewPlugin extends IntegrationPlugin {
	override renderer = HandlerViewRenderer as IntegrationPlugin['renderer'];

	override async setup(): Promise<void> {}

	override async teardown(): Promise<void> {}
}

describe('handler-rendered view asset cache', () => {
	let rootDir = '';

	beforeEach(() => {
		vi.spyOn(FileStylesheetProcessor.prototype, 'process');
		vi.spyOn(FileScriptProcessor.prototype, 'process');
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (rootDir) {
			rmSync(rootDir, { recursive: true, force: true });
		}
	});

	it('processes each stylesheet and script once when the same view renders twice', async () => {
		rootDir = mkdtempSync(path.join(tmpdir(), 'render-context-assets-'));
		const viewDir = path.join(rootDir, 'src', 'views');
		mkdirSync(viewDir, { recursive: true });
		writeFileSync(path.join(viewDir, 'site.css'), 'body { color: red; }');
		writeFileSync(path.join(viewDir, 'site.js'), 'console.log(1);\n');

		const appConfig = {
			rootDir,
			srcDir: 'src',
			distDir: 'dist',
			absolutePaths: {
				srcDir: path.join(rootDir, 'src'),
				distDir: path.join(rootDir, 'dist'),
			},
			processors: new Map(),
		} as unknown as EcoPagesAppConfig;

		const plugin = new HandlerViewPlugin({
			name: 'kitajs',
			extensions: ['.kita.tsx'],
		});
		plugin.setConfig(appConfig);

		const view = (() => '') as EcoFunctionComponent<Record<string, unknown>, string>;
		view.config = {
			integration: 'kitajs',
			identity: {
				id: 'latest',
				file: path.join(viewDir, 'latest.kita.tsx'),
				integration: 'kitajs',
			},
			dependencies: {
				stylesheets: ['./site.css'],
				scripts: ['./site.js'],
			},
		};

		const renderContext = createRenderContext({ integrations: [plugin] });

		await renderContext.render(view, {});
		await renderContext.render(view, {});

		expect(vi.mocked(FileStylesheetProcessor.prototype.process)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(FileScriptProcessor.prototype.process)).toHaveBeenCalledTimes(1);
	});
});
