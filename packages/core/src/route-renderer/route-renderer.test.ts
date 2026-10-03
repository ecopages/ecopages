import { describe, expect, it, vi } from 'vitest';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { RouteRendererFactory } from './route-renderer.ts';

describe('RouteRendererFactory runtime binding', () => {
	it('discards origin-bound renderers when the listening origin changes', () => {
		const firstRenderer = { renderToResponse: vi.fn() };
		const secondRenderer = { renderToResponse: vi.fn() };
		const integration = {
			name: 'test',
			extensions: ['.test.ts'],
			initializeRenderer: vi.fn().mockReturnValueOnce(firstRenderer).mockReturnValueOnce(secondRenderer),
			setRuntimeOrigin: vi.fn(),
		};
		const factory = new RouteRendererFactory({
			appConfig: { integrations: [integration] } as unknown as EcoPagesAppConfig,
			runtimeOrigin: 'http://localhost:3000',
		});

		expect(factory.getExplicitViewRenderer('test')).toBe(firstRenderer);
		factory.setRuntimeOrigin('http://localhost:3001');

		expect(factory.runtimeOrigin).toBe('http://localhost:3001');
		expect(integration.setRuntimeOrigin).toHaveBeenCalledWith('http://localhost:3001');
		expect(factory.getExplicitViewRenderer('test')).toBe(secondRenderer);
	});

	it('resolves a dotted file name to its owner, and names a file no Integration owns', () => {
		const html = { name: 'html', extensions: ['.html'] };
		const factory = new RouteRendererFactory({
			appConfig: { integrations: [html] } as unknown as EcoPagesAppConfig,
			runtimeOrigin: 'http://localhost:3000',
		});

		expect(factory.getIntegrationPlugin('/app/src/pages/v1.2.html')).toBe(html);
		expect(() => factory.getIntegrationPlugin('/app/src/pages/about.md')).toThrow(
			'No registered Integration owns /app/src/pages/about.md',
		);
	});
});
