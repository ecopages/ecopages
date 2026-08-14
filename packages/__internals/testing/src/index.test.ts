import { describe, expect, it } from 'vitest';
import type { EcoComponent, EcoPagesElement } from '@ecopages/core';
import { IntegrationPlugin } from '@ecopages/core/plugins/integration-plugin';
import {
	IntegrationRenderer,
	type RenderToResponseContext,
} from '@ecopages/core/route-renderer/orchestration/integration-renderer';
import { createStringMarkupIntegration, createTestAppConfig } from './index.ts';

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
	it('installs the test-only string Integration by default', async () => {
		const config = await createTestAppConfig();

		expect(config.integrations.map((integration) => integration.name)).toEqual(['string']);
		expect(config.templatesExt).toEqual(['.string.ts']);
	});

	it('allows an integration-free config when requested explicitly', async () => {
		const config = await createTestAppConfig({ integrations: [] });

		expect(config.integrations).toEqual([]);
		expect(config.templatesExt).toEqual([]);
	});

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

describe('createStringMarkupIntegration', () => {
	it('owns .string.ts files by default', () => {
		const integration = createStringMarkupIntegration();

		expect(integration.name).toBe('string');
		expect(integration.extensions).toEqual(['.string.ts']);
	});

	it('allows fixture ownership to use a custom name and extensions', () => {
		const integration = createStringMarkupIntegration({
			name: 'fixture-string',
			extensions: ['.fixture.ts'],
		});

		expect(integration.name).toBe('fixture-string');
		expect(integration.extensions).toEqual(['.fixture.ts']);
	});
});
