import { path } from '@ecopages/file-system/path';
import { describe, expect, it } from 'vitest';
import { eco } from '../../eco/eco.ts';
import { bindComponentIdentity, getComponentIdentity } from '../../eco/component-identity.ts';
import { attributeComponentIdentity } from '../../plugins/eco-component-meta-plugin.ts';
import { IntegrationRenderer } from './integration-renderer.ts';
import { createMockAppConfig, testAssetService } from './integration-renderer.test-fixtures.ts';
import type { EcoComponent, EcoPageFile, EcoPagesElement } from '../../types/contracts.ts';

class ShapeRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = 'shape-renderer';

	constructor(private readonly routeModule: EcoPageFile) {
		super({ appConfig: createMockAppConfig(), assetProcessingService: testAssetService });
	}

	override async render(): Promise<string> {
		return '';
	}

	protected override async importPageFile(): Promise<EcoPageFile> {
		return this.routeModule;
	}
}

const routeFile = path.resolve('/app/pages/about.tsx');

const declaredPage = () => {
	const page = (() => 'page') as EcoComponent;
	page.config = { identity: { id: 'about', file: routeFile, integration: 'shape-renderer' } };
	return page;
};

describe('a route module that is not a Page', () => {
	it('loads an eco.page() result that carries an identity', async () => {
		const module = { default: declaredPage() } as EcoPageFile;

		await expect(new ShapeRenderer(module).loadPageModule(routeFile)).resolves.toBe(module);
	});

	it.each([
		['a plain function', { default: () => 'helper' }],
		['a plain object', { default: { title: 'not a page' } }],
		['no default export', {}],
	])('fails for %s, naming the file and the fixes', async (_label, module) => {
		const error = await new ShapeRenderer(module as unknown as EcoPageFile)
			.loadPageModule(routeFile)
			.catch((e) => e);

		expect(error).toBeInstanceOf(Error);
		expect(error.message).toContain(routeFile);
		expect(error.message).toContain('prefix its name with "_"');
		expect(error.message).toContain('role suffix such as .server.ts or .script.ts');
		expect(error.message).toContain('move it out of the pages directory');
	});

	it('leaves out the file fixes for a view outside the pages directory', async () => {
		const viewFile = path.resolve('/app/views/about.tsx');
		const error = await new ShapeRenderer({} as EcoPageFile).loadPageModule(viewFile).catch((e) => e);

		expect(error.message).toContain(viewFile);
		expect(error.message).not.toContain('prefix its name');
	});

	it('fails for a Page made by a wrapper in another file, naming the literal-call rule', async () => {
		const wrapperFile = path.resolve('/app/pages/_create-page.tsx');
		const { code } = attributeComponentIdentity(
			`import { eco } from '@ecopages/core';\nexport const createPage = (options) => eco.page({ ...options });\n`,
			wrapperFile,
			{ integration: 'shape-renderer', projectRoot: path.resolve('/app') },
		);
		const [, id, file] = code.match(/bindComponentIdentity\(\{ id: "([^"]+)", file: "([^"]+)"/) ?? [];
		const page = eco.page(
			bindComponentIdentity({ id: id!, file: file!, integration: 'shape-renderer' }, { render: () => 'page' }),
		);
		expect(getComponentIdentity(page)?.file).toBe('pages/_create-page.tsx');

		const error = await new ShapeRenderer({ default: page } as EcoPageFile)
			.loadPageModule(routeFile)
			.catch((e) => e);

		expect(error.message).toContain(routeFile);
		expect(error.message).toContain(
			'A route file declares its Page with a literal `eco.page(...)` call in that file',
		);
		expect(error.message).toContain('re-exported');
		expect(error.message).toContain('const page = eco.page');
	});

	it('fails for an eco.page() result with no identity at all', async () => {
		const wrapped = (() => 'page') as EcoComponent;
		wrapped.config = { dependencies: {} };

		const error = await new ShapeRenderer({ default: wrapped } as EcoPageFile)
			.loadPageModule(routeFile)
			.catch((e) => e);

		expect(error.message).toContain('literal `eco.page(...)` call');
	});

	it('accepts an identity given as a path relative to the app root', async () => {
		const page = (() => 'page') as EcoComponent;
		page.config = { identity: { id: 'about', file: 'pages/about.tsx', integration: 'shape-renderer' } };
		const module = { default: page } as EcoPageFile;

		await expect(new ShapeRenderer(module).loadPageModule(routeFile)).resolves.toBe(module);
	});

	it('fails a render the same way, before any Page option is read', async () => {
		const renderer = new ShapeRenderer({} as EcoPageFile);

		await expect(renderer.resolveRouteRenderInputs({ file: routeFile, params: {}, query: {} })).rejects.toThrow(
			`${routeFile} does not default-export a Page`,
		);
	});
});
