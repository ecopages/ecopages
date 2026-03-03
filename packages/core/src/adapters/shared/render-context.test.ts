import { describe, it, expect, vi } from 'vitest';
import { createRenderContext } from './render-context.ts';
import type { IntegrationPlugin } from '../../plugins/integration-plugin.ts';
import type { IntegrationRenderer } from '../../route-renderer/integration-renderer.ts';
import type { EcoFunctionComponent } from '../../public-types.ts';

describe('createRenderContext', () => {
	const RenderToResponse = vi.fn(() => Promise.resolve(new Response('rendered')));

	const Renderer = {
		name: '-renderer',
		renderToResponse: RenderToResponse,
	} as unknown as IntegrationRenderer;

	const ExplicitRenderer = {
		name: 'explicit-renderer',
		renderToResponse: RenderToResponse,
	} as unknown as IntegrationRenderer;

	const InitializeRenderer = vi.fn(() => Renderer);

	const Plugin = {
		name: '-integration',
		initializeRenderer: InitializeRenderer,
	} as unknown as IntegrationPlugin;

	const ExplicitInitializeRenderer = vi.fn(() => ExplicitRenderer);

	const ExplicitPlugin = {
		name: 'explicit-renderer',
		initializeRenderer: ExplicitInitializeRenderer,
	} as unknown as IntegrationPlugin;

	const ViewFn = ((props: { foo: string }) => `<div>${props.foo}</div>`) as EcoFunctionComponent<
		{ foo: string },
		string
	>;
	ViewFn.config = {
		__eco: {
			id: 'test',
			file: '/some/dir/-view.ts',
			integration: '-integration',
		},
	};

	const renderContext = createRenderContext({
		integrations: [Plugin, ExplicitPlugin],
	});

	it('should create a render context with methods', () => {
		expect(renderContext.render).toBeDefined();
		expect(renderContext.renderPartial).toBeDefined();
		expect(renderContext.json).toBeDefined();
		expect(renderContext.html).toBeDefined();
	});

	describe('render', () => {
		it('should call renderer.renderToResponse with partial: false', async () => {
			RenderToResponse.mockClear();
			InitializeRenderer.mockClear();
			ExplicitInitializeRenderer.mockClear();
			const props = { foo: 'bar' };
			const options = { status: 201, headers: { 'X-Custom': '1' } };

			const response = await renderContext.render(ViewFn, props, options);

			expect(InitializeRenderer).toHaveBeenCalled();
			expect(RenderToResponse).toHaveBeenCalledWith(ViewFn, props, {
				partial: false,
				status: 201,
				headers: { 'X-Custom': '1' },
			});
			expect(response instanceof Response).toBe(true);
		});

		it('should throw if view integration is unknown', async () => {
			const badViewFn = (() => '<div></div>') as EcoFunctionComponent<{}, string>;
			badViewFn.config = { __eco: { id: 'test', file: '/bad-view.ts', integration: 'unknown' } };
			await expect(renderContext.render(badViewFn, {})).rejects.toThrow('No integration found for: unknown');
		});

		it('should throw if view integration is missing', async () => {
			const badViewFn = (() => '<div></div>') as EcoFunctionComponent<{}, string>;
			badViewFn.config = { __eco: undefined };
			await expect(renderContext.render(badViewFn, {})).rejects.toThrow('Cannot determine integration for view');
		});

		it('should prefer explicit config.integration over injected metadata', async () => {
			RenderToResponse.mockClear();
			InitializeRenderer.mockClear();
			ExplicitInitializeRenderer.mockClear();

			const explicitViewFn = (() => '<div></div>') as EcoFunctionComponent<{}, string>;
			explicitViewFn.config = {
				integration: 'explicit-renderer',
				__eco: { id: 'test', file: '/some/file.tsx', integration: '-integration' },
			};

			await renderContext.render(explicitViewFn, {});

			expect(ExplicitInitializeRenderer).toHaveBeenCalled();
			expect(InitializeRenderer).not.toHaveBeenCalled();
		});
	});

	describe('renderPartial', () => {
		it('should call renderer.renderToResponse with partial: true', async () => {
			RenderToResponse.mockClear();
			const props = { foo: 'bar' };
			const options = { status: 200 };

			await renderContext.renderPartial(ViewFn, props, options);

			expect(InitializeRenderer).toHaveBeenCalled();
			expect(RenderToResponse).toHaveBeenCalledWith(ViewFn, props, {
				partial: true,
				status: 200,
				headers: undefined,
			});
		});
	});

	describe('json', () => {
		it('should return a JSON response', async () => {
			const data = { hello: 'world' };
			const response = renderContext.json(data);
			expect(response.headers.get('Content-Type')).toContain('application/json');
			expect(await response.json()).toEqual(data);
		});

		it('should support custom status and headers', async () => {
			const response = renderContext.json({}, { status: 201, headers: { 'X-Test': 'true' } });
			expect(response.status).toBe(201);
			expect(response.headers.get('X-Test')).toBe('true');
		});
	});

	describe('html', () => {
		it('should return an HTML response', async () => {
			const html = '<div>hello</div>';
			const response = renderContext.html(html);
			expect(response.headers.get('Content-Type')).toContain('text/html');
			expect(await response.text()).toBe(html);
		});
	});
});
