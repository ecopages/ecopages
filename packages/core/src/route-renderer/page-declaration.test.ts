import { path } from '@ecopages/file-system/path';
import { describe, expect, it, vi } from 'vitest';
import { createRenderContext } from '../adapters/shared/runtime/render-context.ts';
import { ExplicitStaticRouteMatcher } from '../adapters/shared/http/explicit-static-route-matcher.ts';
import { createViewReference } from '../build/server/view-reference.ts';
import { createMockAppConfig } from './orchestration/integration-renderer.test-fixtures.ts';
import { assertViewDeclaredIn } from './page-declaration.ts';
import type { EcoComponent } from '../types/contracts.ts';

const rootDir = path.resolve('/app');
const viewFile = path.join(rootDir, 'views/about.tsx');

function viewIdentifiedBy(file: string): EcoComponent {
	const view = (() => 'view') as EcoComponent;
	view.config = { identity: { id: 'about', file: path.relative(rootDir, file), integration: 'shape' } };
	return view;
}

describe('assertViewDeclaredIn', () => {
	it('accepts a view whose literal eco.page() call is in its own file', () => {
		expect(() => assertViewDeclaredIn(viewFile, viewIdentifiedBy(viewFile), rootDir)).not.toThrow();
	});

	it('fails a view made by a wrapper in another file with the literal-call message', () => {
		const wrapped = viewIdentifiedBy(path.join(rootDir, 'views/_create-view.tsx'));

		expect(() => assertViewDeclaredIn(viewFile, wrapped, rootDir)).toThrow(
			'A route file declares its Page with a literal `eco.page(...)` call in that file',
		);
	});
});

describe('explicit views', () => {
	it('fails app.static for a view a wrapper declared in another file', async () => {
		const wrapped = viewIdentifiedBy(path.join(rootDir, 'views/_create-view.tsx'));
		const loader = Object.assign(async () => ({ default: wrapped }), { filePath: viewFile });
		const matcher = new ExplicitStaticRouteMatcher({
			appConfig: createMockAppConfig(),
			routeRendererFactory: { getExplicitViewRenderer: vi.fn() as never },
			staticRoutes: [{ path: '/about', loader: loader as never }],
		});

		await expect(matcher.handleMatch(matcher.match('http://localhost:3000/about')!)).rejects.toThrow(
			'literal `eco.page(...)` call',
		);
	});

	it('fails ctx.render for a wrapped view imported by reference', async () => {
		const wrapped = viewIdentifiedBy(path.join(rootDir, 'views/_create-view.tsx'));
		const context = createRenderContext({
			integrations: [],
			rootDir,
			importServerModule: async () => ({ default: wrapped }),
		});

		await expect(context.render(createViewReference(viewFile) as never, {})).rejects.toThrow(
			'literal `eco.page(...)` call',
		);
	});
});
