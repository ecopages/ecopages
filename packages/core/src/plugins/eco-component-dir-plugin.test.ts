import { describe, expect, it, spyOn } from 'bun:test';
import { createEcoComponentDirPlugin } from './eco-component-dir-plugin';
import type { EcoPagesAppConfig } from '../internal-types';
import { FileUtils } from '../utils/file-utils.module';

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

		const fileSpy = spyOn(FileUtils, 'getFileAsString').mockImplementation(async () => content);

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
});
