import { describe, expect, it, vi } from 'vitest';
import type { AppRuntime } from '../config/assembly/app-runtime.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { RouteRendererFactory } from './route-renderer.ts';

function testRuntime(origin: string): AppRuntime {
	return { origin, hmr: null } as AppRuntime;
}

describe('RouteRendererFactory runtime binding', () => {
	it('uses the Integration-owned renderer instead of keeping a second cache', () => {
		const firstRenderer = { renderToResponse: vi.fn() };
		const secondRenderer = { renderToResponse: vi.fn() };
		const integration = {
			name: 'test',
			extensions: ['.test.ts'],
			getRenderer: vi.fn().mockReturnValueOnce(firstRenderer).mockReturnValueOnce(secondRenderer),
		};
		const factory = new RouteRendererFactory({
			appConfig: { integrations: [integration] } as unknown as EcoPagesAppConfig,
			runtime: testRuntime('http://localhost:3000'),
		});

		expect(factory.getPageRenderer('/app/src/pages/about.test.ts')).toBe(firstRenderer);
		expect(factory.getPageRenderer('/app/src/pages/about.test.ts')).toBe(secondRenderer);
		expect(integration.getRenderer).toHaveBeenCalledTimes(2);
	});

	it('resolves a dotted file name to its owner, and names a file no Integration owns', () => {
		const html = { name: 'html', extensions: ['.html'] };
		const factory = new RouteRendererFactory({
			appConfig: { integrations: [html] } as unknown as EcoPagesAppConfig,
			runtime: testRuntime('http://localhost:3000'),
		});

		expect(factory.getIntegrationPlugin('/app/src/pages/v1.2.html')).toBe(html);
		expect(() => factory.getIntegrationPlugin('/app/src/pages/about.md')).toThrow(
			'No registered Integration owns /app/src/pages/about.md',
		);
	});
});
