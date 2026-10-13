import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestAppConfig } from '@ecopages/testing';
import { IntegrationPlugin } from '../../../plugins/integration-plugin.ts';
import { StringMarkupRenderer } from '../../../route-renderer/orchestration/string-markup-renderer.ts';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type {
	EcoComponent,
	EcoFunctionComponent,
	EcoPageComponent,
	HtmlTemplateProps,
} from '../../../types/public-types.ts';
import { ExplicitStaticRouteMatcher } from '../http/explicit-static-route-matcher.ts';
import { createRenderContext } from './render-context.ts';

const HtmlTemplate: EcoComponent<HtmlTemplateProps> = async ({ children }) => `<html><body>${children}</body></html>`;

class ExplicitViewTestRenderer extends StringMarkupRenderer {
	declare name: string;

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		return HtmlTemplate;
	}
}

class ExplicitViewTestPlugin extends IntegrationPlugin {
	override renderer = ExplicitViewTestRenderer as IntegrationPlugin['renderer'];

	override async setup(): Promise<void> {}

	override async teardown(): Promise<void> {}
}

describe('explicit views rendered through real renderers', () => {
	let rootDir = '';

	afterEach(() => {
		if (rootDir) {
			rmSync(rootDir, { recursive: true, force: true });
		}
	});

	async function createPlugin(): Promise<{ plugin: ExplicitViewTestPlugin; appConfig: EcoPagesAppConfig }> {
		rootDir = mkdtempSync(path.join(tmpdir(), 'explicit-view-'));
		const appConfig = await createTestAppConfig({ rootDir, integrations: [] });
		const plugin = new ExplicitViewTestPlugin({ name: 'kitajs', extensions: ['.kita.tsx'] });
		plugin.setConfig(appConfig);
		return { plugin, appConfig };
	}

	function createView(
		render: (props: Record<string, any>) => string,
		hooks: Partial<Pick<EcoPageComponent<any>, 'staticProps' | 'metadata'>> = {},
	): EcoPageComponent<any> & EcoFunctionComponent<any, any> {
		const view = ((props: Record<string, any>) => render(props)) as EcoPageComponent<any> &
			EcoFunctionComponent<any, any>;
		view.config = {
			integration: 'kitajs',
			identity: { id: 'view', file: path.join(rootDir, 'src', 'views', 'view.kita.tsx'), integration: 'kitajs' },
		};
		Object.assign(view, hooks);
		return view;
	}

	it('gives the view the handler locals, params and query', async () => {
		const { plugin } = await createPlugin();
		const view = createView(({ locals, params, query }) => `<p>${locals.user}|${params.slug}|${query.page}</p>`);
		const handler = {
			...createRenderContext({ integrations: [plugin] }),
			locals: { user: 'ada' },
			params: { slug: 'intro' },
			request: new Request('http://localhost:3000/posts/intro?page=2'),
		};

		const html = await (await handler.render(view, {})).text();

		expect(html).toContain('<p>ada|intro|2</p>');
	});

	it('runs the view metadata with the render props, params and no static props', async () => {
		const { plugin } = await createPlugin();
		const staticProps = vi.fn(async () => ({ props: { fromHook: true } }));
		const metadata = vi.fn(async ({ props, params }: any) => ({
			title: `${props.title}-${params.slug}`,
			description: 'd',
		}));
		const view = createView(() => '<p>view</p>', { staticProps, metadata });
		const handler = {
			...createRenderContext({ integrations: [plugin] }),
			params: { slug: 'intro' },
		};

		await handler.render(view, { title: 'Explicit' });

		expect(staticProps).not.toHaveBeenCalled();
		expect(metadata).toHaveBeenCalledTimes(1);
		expect(metadata).toHaveBeenCalledWith(
			expect.objectContaining({ props: { title: 'Explicit' }, params: { slug: 'intro' } }),
		);
	});

	it('runs staticProps and metadata once for an explicit static route', async () => {
		const { plugin, appConfig } = await createPlugin();
		const staticProps = vi.fn(async ({ pathname }: any) => ({ props: { title: pathname.params.slug } }));
		const metadata = vi.fn(async ({ props }: any) => ({ title: String(props.title), description: 'd' }));
		const view = createView(({ title }) => `<p>${title}</p>`, { staticProps, metadata });
		const matcher = new ExplicitStaticRouteMatcher({
			appConfig,
			routeRendererFactory: { getExplicitViewRenderer: () => plugin.initializeRenderer() as never },
			staticRoutes: [{ path: '/blog/[slug]', loader: async () => ({ default: view }) }],
		});

		const match = matcher.match('http://localhost:3000/blog/intro');
		const html = await (await matcher.handleMatch(match!)).text();

		expect(html).toContain('<p>intro</p>');
		expect(staticProps).toHaveBeenCalledTimes(1);
		expect(metadata).toHaveBeenCalledTimes(1);
	});
});
