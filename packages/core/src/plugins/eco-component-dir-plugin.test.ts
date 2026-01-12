import { describe, expect, it, spyOn } from 'bun:test';
import { createEcoComponentDirPlugin } from './eco-component-dir-plugin';
import type { EcoPagesAppConfig } from '../internal-types';
import { fileSystem } from '@ecopages/file-system';

/**
 * @todo some tests are causing issues with how Bun parse the file, i.e. template literals with ${'<div>'} syntax
 * These tests need to be revisited once Bun's parser is more stable
 */

describe('eco-component-dir-plugin', () => {
	const mockConfig = {
		integrations: [
			{
				name: 'react',
				extensions: ['.tsx', '.mdx'],
			},
		],
	} as EcoPagesAppConfig;

	const plugin = createEcoComponentDirPlugin({ config: mockConfig });

	/**
	 * Mock helper function to run the plugin on a given content file
	 * @param content The content of the file
	 * @param filePath The path of the file
	 * @returns The result of the plugin
	 */
	async function runPluginOnContent(content: string, filePath: string) {
		let regexFilter: RegExp | undefined;
		let onLoadCallback: any;

		const buildMock = {
			onLoad: (options: { filter: RegExp }, callback: any) => {
				regexFilter = options.filter;
				onLoadCallback = callback;
			},
		};

		plugin.setup(buildMock as any);

		if (!onLoadCallback || !regexFilter) {
			throw new Error('Plugin did not register onLoad handler');
		}

		if (!regexFilter.test(filePath)) {
			throw new Error(`File path ${filePath} does not match plugin filter ${regexFilter}`);
		}

		const fileSpy = spyOn(fileSystem, 'readFile').mockImplementation(async () => content);

		try {
			return await onLoadCallback({ path: filePath });
		} finally {
			fileSpy.mockRestore();
		}
	}

	it('should inject componentDir into export const config assignment', async () => {
		const content = `
            import { Counter } from './counter';
            export const config = {
                dependencies: {
                    components: [Counter],
                },
            };
        `;

		const result = await runPluginOnContent(content, '/path/to/file.tsx');

		expect(result).toBeDefined();
		expect(result.contents).toContain('componentDir: "/path/to",');
	});

	it('should inject componentDir into config assignment', async () => {
		const content = `
            MyComponent.config = {
                dependencies: {}
            };
        `;

		const result = await runPluginOnContent(content, '/path/to/component.tsx');

		expect(result).toBeDefined();
		expect(result.contents).toContain('componentDir: "/path/to",');
	});

	it('should inject componentDir into config object property', async () => {
		const content = `
            export const MyElement = {
                config: {
                    dependencies: {}
                }
            };
        `;

		const result = await runPluginOnContent(content, '/path/to/element.ts');

		expect(result).toBeDefined();
		expect(result.contents).toContain('componentDir: "/path/to",');
	});

	it('should inject componentDir into eco.component() call', async () => {
		const content = `
            import { eco } from '@ecopages/core';
            export const Counter = eco.component${'<CounterProps>'}({
                dependencies: {
                    scripts: ['./counter.ts'],
                },
                render: () => '${'<div>'}Counter${'</div>'}',
            });
        `;

		const result = await runPluginOnContent(content, '/path/to/counter.tsx');

		expect(result).toBeDefined();
		expect(result.contents).toContain('componentDir: "/path/to",');
		expect(result.contents).toContain('eco.component' + '<CounterProps>({');
		expect(result.contents).toContain('componentDir:');
	});

	it('should inject componentDir into eco.page call', async () => {
		const content = `
            import { eco } from '@ecopages/core';
            export default eco.page({
                dependencies: {
                    components: [],
                },
                render: () => '${'<main>'}Page${'</main>'}',
            });
        `;

		const result = await runPluginOnContent(content, '/path/to/pages/index.tsx');

		expect(result).toBeDefined();
		expect(result.contents).toContain('componentDir: "/path/to/pages",');
		expect(result.contents).toContain('eco.page' + '({');
	});

	it('should inject componentDir into eco.component() with lazy dependencies', async () => {
		const content = `
            export const LazyCounter = eco.component({
                dependencies: {
                    lazy: {
                        'on:interaction': 'click',
                        scripts: ['./counter.ts'],
                    },
                },
                render: () => '${'<div>'}Lazy${'</div>'}',
            });
        `;

		const result = await runPluginOnContent(content, '/path/to/lazy-counter.tsx');

		expect(result).toBeDefined();
		expect(result.contents).toContain('componentDir: "/path/to",');
	});

	it('should inject componentDir into eco.component() with nested generics like Head', async () => {
		const content = `import { eco } from '@ecopages/core';
import type { PageHeadProps } from '@ecopages/core';
import { Seo } from '@/includes/seo.kita';

export const Head = eco.component<PageHeadProps<string>>({
	dependencies: {
		stylesheets: ['../styles/global.css'],
	},
	render: ({ metadata, children }) => (
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			<Seo {...metadata} />
			{children}
		</head>
	),
});`;

		const result = await runPluginOnContent(content, '/path/to/includes/head.kita.tsx');

		expect(result).toBeDefined();
		expect(result.contents).toContain('componentDir: "/path/to/includes",');
	});
});
