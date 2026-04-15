/** @jsxImportSource @ecopages/jsx */
import { describe, expect, it, vi } from 'vitest';
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { eco } from '@ecopages/core';
import type { JsxRenderable } from '@ecopages/jsx';
import { EcopagesJsxRenderer } from '../ecopages-jsx-renderer.ts';

const Config = await new ConfigBuilder()
	.setRobotsTxt({
		preferences: {
			'*': [],
		},
	})
	.setIntegrations([])
	.setDefaultMetadata({
		title: 'Ecopages',
		description: 'Ecopages',
	})
	.setBaseUrl('http://localhost:3000')
	.build();

describe('EcopagesJsxRenderer', () => {
	describe('renderComponent', () => {
		it('returns component-scoped dependency assets for component boundary renders', async () => {
			const processDependencies = vi.fn(async () => [
				{
					kind: 'script',
					srcUrl: '/assets/component.js',
					position: 'head',
				},
			]);
			const renderer = new EcopagesJsxRenderer({
				appConfig: Config,
				assetProcessingService: {
					processDependencies,
				} as never,
				runtimeOrigin: 'http://localhost:3000',
				resolvedIntegrationDependencies: [],
			});

			const Component = eco.component<{}, JsxRenderable>({
				integration: 'ecopages-jsx',
				dependencies: {
					scripts: ['./component.script.ts'],
				},
				render: () => <section data-component-root>ready</section>,
			});

			const result = await renderer.renderComponent({
				component: Component,
				props: {},
			});

			expect(processDependencies).toHaveBeenCalled();
			expect(result.html).toContain('data-component-root');
			expect(result.assets).toEqual([
				{
					kind: 'script',
					srcUrl: '/assets/component.js',
					position: 'head',
				},
			]);
		});
	});
});
