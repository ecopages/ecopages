import { describe, expect, it } from 'vitest';
import type { EcoComponent, EcoPagesElement } from '@ecopages/core';
import { IntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { createTestAppConfig } from './index.ts';

class TestRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = 'test';

	async render(): Promise<string> {
		return '';
	}

	override async renderComponent() {
		return {
			html: '<div>test</div>',
			canAttachAttributes: true,
			rootTag: 'div',
			integrationName: this.name,
		};
	}

	async renderToResponse<P = Record<string, unknown>>(
		_view: EcoComponent<P>,
		_props: P,
		_ctx: RenderToResponseContext,
	) {
		return new Response('');
	}
}

class TestPlugin extends IntegrationPlugin<EcoPagesElement> {
	renderer = TestRenderer;

	constructor() {
		super({
			name: 'test',
			extensions: ['.test.tsx'],
		});
	}
}

describe('createTestAppConfig', () => {
	it('allows builder overrides through configure', async () => {
		const config = await createTestAppConfig({
			configure: (builder) => builder.setRootDir('/tmp/test-root').setWorkDir('.eco-parallel'),
		});

		expect(config.rootDir).toBe('/tmp/test-root');
		expect(config.workDir).toBe('.eco-parallel');
	});

	it('allows integrations to use a runtime origin different from baseUrl', async () => {
		const plugin = new TestPlugin();

		await createTestAppConfig({
			baseUrl: 'http://localhost:3100',
			runtimeOrigin: 'http://127.0.0.1:4100',
			integrations: [plugin],
		});

		expect(plugin.runtimeOrigin).toBe('http://127.0.0.1:4100');
	});
});