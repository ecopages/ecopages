import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestAppConfig } from '@ecopages/testing';
import { IntegrationPlugin } from '../../../plugins/integration-plugin.ts';
import { StringMarkupRenderer } from '../../../route-renderer/orchestration/string-markup-renderer.ts';
import { FileScriptProcessor } from '../../../services/assets/asset-processing-service/processors/script/file-script.processor.ts';
import { FileStylesheetProcessor } from '../../../services/assets/asset-processing-service/processors/stylesheet/file-stylesheet.processor.ts';
import type { EcoComponent, EcoFunctionComponent, HtmlTemplateProps } from '../../../types/public-types.ts';
import { createRenderContext } from './render-context.ts';

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ children }) => `<html><body>${children}</body></html>`;

class HandlerViewRenderer extends StringMarkupRenderer {
	declare name: string;

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return HtmlTemplate;
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

		const appConfig = await createTestAppConfig({ rootDir, integrations: [] });
		const plugin = new HandlerViewPlugin({ name: 'kitajs', extensions: ['.kita.tsx'] });
		plugin.setConfig(appConfig);

		const view = (() => '<main>Latest</main>') as EcoFunctionComponent<Record<string, unknown>, string>;
		view.config = {
			integration: 'kitajs',
			identity: { id: 'latest', file: path.join(viewDir, 'latest.kita.tsx'), integration: 'kitajs' },
			dependencies: { stylesheets: ['./site.css'], scripts: ['./site.js'] },
		};

		const renderContext = createRenderContext({ integrations: [plugin] });

		const first = await (await renderContext.render(view, {})).text();
		const second = await (await renderContext.render(view, {})).text();

		expect(first).toContain('<main>Latest</main>');
		expect(second).toContain('<main>Latest</main>');
		expect(vi.mocked(FileStylesheetProcessor.prototype.process)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(FileScriptProcessor.prototype.process)).toHaveBeenCalledTimes(1);
	});
});
