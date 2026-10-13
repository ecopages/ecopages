import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { HttpError } from '../../errors/http-error.ts';
import { ErrorPageRenderer } from './error-page-renderer.ts';

const appConfig = {
	rootDir: '/app',
	baseUrl: 'http://localhost:3000',
	absolutePaths: {
		error404TemplatePath: '/app/src/pages/404.kita.tsx',
		error500TemplatePath: '/app/src/pages/500.kita.tsx',
	},
} as EcoPagesAppConfig;

function createView(file = '/app/src/views/not-found.kita.tsx') {
	return Object.assign(() => null, {
		config: { identity: { integration: 'fixture', file } },
	}) as never;
}

describe('ErrorPageRenderer', () => {
	const originalNodeEnv = process.env.NODE_ENV;

	afterEach(() => {
		vi.restoreAllMocks();
		if (originalNodeEnv === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = originalNodeEnv;
		}
	});

	it('prefers a filesystem template over a registered loader', async () => {
		vi.spyOn(fileSystem, 'exists').mockImplementation((candidate) => candidate === '/app/src/pages/404.kita.tsx');
		const execute = vi.fn(async () => ({ body: '<html>filesystem</html>' }));
		const loader = vi.fn(async () => ({ default: createView() }));
		const renderer = new ErrorPageRenderer({
			appConfig,
			routeRendererFactory: {
				getPageRenderer: vi.fn(() => ({ execute, loadPageModule: vi.fn() })),
				getExplicitViewRenderer: vi.fn(),
			},
			errorPageLoaders: { notFound: loader },
		});

		const result = await renderer.render({ kind: 'notFound' });

		expect(result).toEqual({ body: '<html>filesystem</html>' });
		expect(loader).not.toHaveBeenCalled();
	});

	it('renders a registered view when no filesystem template exists', async () => {
		vi.spyOn(fileSystem, 'exists').mockReturnValue(false);
		const renderToResponse = vi.fn(async () => new Response('<html>registered</html>'));
		const renderer = new ErrorPageRenderer({
			appConfig,
			routeRendererFactory: {
				getPageRenderer: vi.fn(),
				getExplicitViewRenderer: vi.fn(() => ({
					renderExplicitView: renderToResponse,
					executeExplicitView: vi.fn(),
				})),
			},
			errorPageLoaders: {
				notFound: async () => ({ default: createView() }),
			},
		});

		const result = await renderer.render({ kind: 'notFound' });

		expect(result.body).toBe('<html>registered</html>');
		expect(renderToResponse).toHaveBeenCalledWith(expect.anything(), { status: 404 }, { status: 404 });
	});

	it('falls back to the built-in document when no custom source exists', async () => {
		vi.spyOn(fileSystem, 'exists').mockReturnValue(false);
		const renderer = new ErrorPageRenderer({ appConfig });

		const result = await renderer.render({ kind: 'notFound' });

		expect(result.body).toContain('eco-error-page__title">Not Found</h1>');
	});

	it('renders the built-in forbidden document for status 403', async () => {
		vi.spyOn(fileSystem, 'exists').mockReturnValue(false);
		const renderer = new ErrorPageRenderer({ appConfig });

		const result = await renderer.render({
			kind: 'forbidden',
			error: HttpError.Forbidden('Admin only'),
		});

		expect(result.body).toContain('eco-error-page__title">Forbidden</h1>');
		expect(result.body).toContain('Admin only');
	});

	it('renders a generic built-in document for non-factory 4xx statuses', async () => {
		vi.spyOn(fileSystem, 'exists').mockReturnValue(false);
		const renderer = new ErrorPageRenderer({ appConfig });

		const result = await renderer.render({ status: 418, error: new Error("I'm a teapot") });

		expect(result.body).toContain('eco-error-page__title">Error 418</h1>');
		expect(result.body).toContain('I&#39;m a teapot');
	});

	it('does not re-enter a custom source from renderBuiltIn', async () => {
		vi.spyOn(fileSystem, 'exists').mockReturnValue(true);
		const renderer = new ErrorPageRenderer({
			appConfig,
			errorPageLoaders: {
				serverError: async () => {
					throw new Error('should not load');
				},
			},
		});

		process.env.NODE_ENV = 'production';
		const result = renderer.renderBuiltIn({ kind: 'serverError', error: new Error('secret') });

		expect(result.body).toContain('eco-error-page__title">Something went wrong</h1>');
		expect(result.body).not.toContain('secret');
	});
});
