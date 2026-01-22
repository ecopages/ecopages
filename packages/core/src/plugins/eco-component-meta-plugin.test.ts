import { describe, expect, it, spyOn } from 'bun:test';
import { createEcoComponentMetaPlugin } from './eco-component-meta-plugin';
import type { EcoPagesAppConfig } from '../internal-types';
import { fileSystem } from '@ecopages/file-system';

describe('eco-component-meta-plugin', () => {
	const mockConfig = {
		integrations: [
			{
				name: 'react',
				extensions: ['.tsx', '.mdx'],
			},
		],
	} as EcoPagesAppConfig;

	const plugin = createEcoComponentMetaPlugin({ config: mockConfig });

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

	it('should inject __eco into export const config assignment', async () => {
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
		expect(result.contents).toContain('__eco: { dir: "/path/to", integration: "react" },');
	});

	it('should inject __eco into config assignment', async () => {
		const content = `
            MyComponent.config = {
                dependencies: {}
            };
        `;

		const result = await runPluginOnContent(content, '/path/to/component.tsx');

		expect(result).toBeDefined();
		expect(result.contents).toContain('__eco: { dir: "/path/to", integration: "react" },');
	});

	it('should inject __eco into config object property', async () => {
		const content = `
            export const MyElement = {
                config: {
                    dependencies: {}
                }
            };
        `;

		const result = await runPluginOnContent(content, '/path/to/element.ts');

		expect(result).toBeDefined();
		expect(result.contents).toContain('__eco: { dir: "/path/to", integration: "ghtml" },');
	});

	it('should inject __eco into eco.component() call', async () => {
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
		expect(result.contents).toContain('__eco: { dir: "/path/to", integration: "react" },');
		expect(result.contents).toContain('eco.component' + '<CounterProps>({');
	});

	it('should inject __eco into eco.page call', async () => {
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
		expect(result.contents).toContain('__eco: { dir: "/path/to/pages", integration: "react" },');
	});

	it('should inject __eco into eco.component() with lazy dependencies', async () => {
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
		expect(result.contents).toContain('__eco: { dir: "/path/to", integration: "react" },');
	});

	it('should detect kitajs integration from .kita.tsx extension', async () => {
		const content = `import { eco } from '@ecopages/core';
import type { PageHeadProps } from '@ecopages/core';

export const Head = eco.component<PageHeadProps<string>>({
	dependencies: {
		stylesheets: ['../styles/global.css'],
	},
	render: ({ metadata, children }) => (
		<head>
			<meta charset="UTF-8" />
			{children}
		</head>
	),
});`;

		const result = await runPluginOnContent(content, '/path/to/includes/head.kita.tsx');

		expect(result).toBeDefined();
		expect(result.contents).toContain('__eco: { dir: "/path/to/includes", integration: "kitajs" },');
	});
});
