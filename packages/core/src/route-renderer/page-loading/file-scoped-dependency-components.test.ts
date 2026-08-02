import { describe, expect, test } from 'vitest';
import type { EcoComponent } from '../../types/public-types.ts';
import {
	attachEcoFileMetadataToConfig,
	collectComponentConfigFilePaths,
	collectDependencyWatchPaths,
	collectFileScopedDependencyComponents,
	createFileScopedDependencyComponent,
	splitPageDependenciesResult,
} from './file-scoped-dependency-components.ts';

describe('createFileScopedDependencyComponent', () => {
	test('returns undefined when no direct assets are declared', () => {
		expect(
			createFileScopedDependencyComponent({
				ownerFile: '/app/pages/demo.tsx',
				integrationName: 'react',
				dependencies: {},
			}),
		).toBeUndefined();
	});

	test('attaches owner file metadata for direct scripts', () => {
		const component = createFileScopedDependencyComponent({
			ownerFile: '/app/pages/demo.tsx',
			integrationName: 'react',
			dependencies: {
				scripts: ['./demo.client.ts'],
			},
		});

		expect(component?.config?.identity).toEqual(
			expect.objectContaining({
				file: '/app/pages/demo.tsx',
				integration: 'react',
			}),
		);
		expect(component?.config?.dependencies?.scripts).toEqual(['./demo.client.ts']);
	});
});

describe('collectFileScopedDependencyComponents', () => {
	test('keeps declared components and adds a file-scoped owner for direct assets', () => {
		const child = (() => null) as EcoComponent;
		child.config = {
			identity: { id: 'child', file: '/app/components/child.tsx', integration: 'react' },
		};

		const components = collectFileScopedDependencyComponents({
			ownerFile: '/app/pages/demo.tsx',
			integrationName: 'react',
			dependencies: {
				components: [child],
				modules: ['react-aria-components{Table}'],
			},
		});

		expect(components).toHaveLength(2);
		expect(components[0]).toBe(child);
		expect(components[1]?.config?.identity?.file).toBe('/app/pages/demo.tsx');
		expect(components[1]?.config?.dependencies?.modules).toEqual(['react-aria-components{Table}']);
	});
});

describe('attachEcoFileMetadataToConfig', () => {
	test('attaches owner file metadata to one config', () => {
		const config = attachEcoFileMetadataToConfig(
			{ dependencies: { scripts: ['./demo.ts'] } },
			'/app/pages/demo.tsx',
			'react',
		);

		expect(config.identity).toEqual(
			expect.objectContaining({
				file: '/app/pages/demo.tsx',
				integration: 'react',
			}),
		);
	});
});

describe('collectComponentConfigFilePaths', () => {
	test('walks nested dependency components and optional layouts', () => {
		const layout = (() => null) as EcoComponent;
		layout.config = {
			identity: { id: 'layout', file: '/app/layouts/docs.tsx', integration: 'ecopages-jsx' },
		};
		const child = (() => null) as EcoComponent;
		child.config = {
			identity: { id: 'child', file: '/app/components/demo.tsx', integration: 'ecopages-jsx' },
		};
		const page = (() => null) as EcoComponent;
		page.config = {
			identity: { id: 'page', file: '/app/pages/docs/index.tsx', integration: 'ecopages-jsx' },
			dependencies: { components: [child] },
			layouts: [layout],
		};

		const withoutLayouts = collectComponentConfigFilePaths([page]);
		expect(withoutLayouts.has('/app/pages/docs/index.tsx')).toBe(true);
		expect(withoutLayouts.has('/app/components/demo.tsx')).toBe(true);
		expect(withoutLayouts.has('/app/layouts/docs.tsx')).toBe(false);

		const withLayouts = collectComponentConfigFilePaths([page], { includeLayouts: true });
		expect(withLayouts.has('/app/layouts/docs.tsx')).toBe(true);
	});
});

describe('collectDependencyWatchPaths', () => {
	test('includes owner file and nested dependency component files', () => {
		const watchPaths = collectDependencyWatchPaths('/app/content/demo.mdx', [
			{
				config: {
					identity: { id: 'demo-component', file: '/app/components/demo.tsx', integration: 'ecopages-jsx' },
				},
			},
		]);

		expect(watchPaths).toEqual(expect.arrayContaining(['/app/content/demo.mdx', '/app/components/demo.tsx']));
		expect(watchPaths).toHaveLength(2);
	});
});

describe('splitPageDependenciesResult', () => {
	test('separates ownerFile from dependency fields', () => {
		expect(
			splitPageDependenciesResult({
				scripts: ['./demo.ts'],
				ownerFile: '/app/content/demo.mdx',
			}),
		).toEqual({
			dependencies: { scripts: ['./demo.ts'] },
			ownerFile: '/app/content/demo.mdx',
		});
	});
});
