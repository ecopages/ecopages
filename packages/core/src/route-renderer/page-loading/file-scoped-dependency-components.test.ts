import { describe, expect, test } from 'vitest';
import type { EcoComponent } from '../../types/public-types.ts';
import {
	attachEcoFileMetadataToConfig,
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

		expect(component?.config?.__eco).toEqual(
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
			__eco: { id: 'child', file: '/app/components/child.tsx', integration: 'react' },
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
		expect(components[1]?.config?.__eco?.file).toBe('/app/pages/demo.tsx');
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

		expect(config.__eco).toEqual(
			expect.objectContaining({
				file: '/app/pages/demo.tsx',
				integration: 'react',
			}),
		);
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
