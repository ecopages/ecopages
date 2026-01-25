import { describe, expect, it, spyOn } from 'bun:test';
import { createEcoComponentMetaPlugin } from './eco-component-meta-plugin';
import type { EcoPagesAppConfig } from '../internal-types';
import { fileSystem } from '@ecopages/file-system';

describe('eco-component-meta-plugin', () => {
	const mockConfig = {
		integrations: [
			{
				name: 'kitajs',
				extensions: ['.kita.tsx'],
			},
			{
				name: 'react',
				extensions: ['.tsx'],
			},
			{
				name: 'ghtml',
				extensions: ['.ts', '.ghtml.ts'],
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

	it('should inject __eco into X.config assignment in TSX files', async () => {
		const content = `
            MyComponent.config = {
                dependencies: {}
            };
        `;

		const result = await runPluginOnContent(content, '/path/to/component.tsx');

		expect(result).toBeDefined();
		expect(result.contents).toContain('__eco: { dir: "/path/to", integration: "react" },');
	});

	it('should NOT inject __eco into config patterns in non-EcoComponent files', async () => {
		const content = `
            export const config = {
                apiUrl: 'https://api.example.com',
                theme: 'dark'
            };
        `;

		const result = await runPluginOnContent(content, '/path/to/settings.tsx');

		expect(result).toBeDefined();
		expect(result.contents).not.toContain('__eco:');
	});

	it('should inject __eco into EcoComponent-typed object with config property', async () => {
		const content = `
            import type { EcoComponent } from '@ecopages/core';

            export const LitCounter: EcoComponent = {
                config: {
                    dependencies: {
                        scripts: ['lit-counter.script.ts'],
                    },
                },
            };
        `;

		const result = await runPluginOnContent(content, '/path/to/lit-counter.ts');

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

	it('should handle eco.page with complex generic types', async () => {
		const content = `
import { eco } from '@ecopages/core';

export default eco.page<{ title: string; callback: (arg: string) => void }>({
	staticProps: async () => ({ props: { title: 'Hello', callback: () => {} } }),
	render: (props) => '<div>' + props.title + '</div>',
});
`;

		const result = await runPluginOnContent(content, '/path/to/pages/complex.tsx');

		expect(result).toBeDefined();
		expect(result.contents).toContain('__eco: { dir: "/path/to/pages", integration: "react" },');
	});

	it('should handle multiple eco.component calls in same file', async () => {
		const content = `
import { eco } from '@ecopages/core';

export const Button = eco.component({
	render: () => '<button>Click</button>',
});

export const Input = eco.component({
	render: () => '<input type="text" />',
});
`;

		const result = await runPluginOnContent(content, '/path/to/components.tsx');

		expect(result).toBeDefined();
		const matches = result.contents.match(/__eco: \{ dir: "\/path\/to", integration: "react" \},/g);
		expect(matches).toHaveLength(2);
	});

	it('should handle eco.component with empty config object', async () => {
		const content = `
import { eco } from '@ecopages/core';

export const Simple = eco.component({});
`;

		const result = await runPluginOnContent(content, '/path/to/simple.tsx');

		expect(result).toBeDefined();
		expect(result.contents).toContain('__eco: { dir: "/path/to", integration: "react" },');
	});

	it('should not inject into non-eco call expressions', async () => {
		const content = `
import { other } from 'some-lib';

export const Thing = other.component({
	render: () => '<div>Thing</div>',
});
`;

		const result = await runPluginOnContent(content, '/path/to/thing.tsx');

		expect(result).toBeDefined();
		expect(result.contents).not.toContain('__eco:');
	});

	it('should not inject into non-config variable declarations', async () => {
		const content = `
const settings = {
	theme: 'dark',
	locale: 'en',
};
`;

		const result = await runPluginOnContent(content, '/path/to/settings.ts');

		expect(result).toBeDefined();
		expect(result.contents).not.toContain('__eco:');
	});

	it('should handle file paths with special characters in directory', async () => {
		const content = `
import { eco } from '@ecopages/core';

export default eco.page({
	render: () => '<div>Page</div>',
});
`;

		const result = await runPluginOnContent(content, '/path/to/my-app/pages/index.tsx');

		expect(result).toBeDefined();
		expect(result.contents).toContain('__eco: { dir: "/path/to/my-app/pages", integration: "react" },');
	});

	it('should handle eco.component with nested object in dependencies', async () => {
		const content = `
import { eco } from '@ecopages/core';

export const LazyComponent = eco.component({
	dependencies: {
		lazy: {
			'on:interaction': 'click',
			scripts: ['./script.ts'],
			stylesheets: ['./style.css'],
		},
		components: [],
	},
	render: () => '<div>Lazy</div>',
});
`;

		const result = await runPluginOnContent(content, '/path/to/lazy.tsx');

		expect(result).toBeDefined();
		expect(result.contents).toContain('__eco: { dir: "/path/to", integration: "react" },');
	});

	it('should preserve original code structure after injection', async () => {
		const content = `import { eco } from '@ecopages/core';

export const Counter = eco.component({
	dependencies: {
		scripts: ['./counter.ts'],
	},
	render: () => '<button>0</button>',
});`;

		const result = await runPluginOnContent(content, '/path/to/counter.tsx');

		expect(result).toBeDefined();
		expect(result.contents).toContain("import { eco } from '@ecopages/core';");
		expect(result.contents).toContain("scripts: ['./counter.ts']");
		expect(result.contents).toContain("render: () => '<button>0</button>'");
	});

	it('should handle query string in file path for cache busting', async () => {
		const content = `
import { eco } from '@ecopages/core';

export default eco.page({
	render: () => '<div>Page</div>',
});
`;

		const result = await runPluginOnContent(content, '/path/to/pages/index.tsx?update=123456');

		expect(result).toBeDefined();
		expect(result.contents).toContain('__eco: { dir: "/path/to/pages", integration: "react" },');
	});
});
