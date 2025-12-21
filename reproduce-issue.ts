import { mdxPlugin } from './packages/integrations/mdx/src/mdx.plugin';

const compilerOptions = {
	remarkPlugins: ['remark-gfm'],
};

const mockAppConfig = {
	srcDir: '.',
	publicDir: '.',
	distDir: '.',
	absolutePaths: {
		pagesDir: '.',
		publicDir: '.',
		distDir: '.',
		htmlTemplatePath: '.',
	},
	defaultMetadata: {},
};

console.log('--- Non-React Mode ---');
const plugin = mdxPlugin({
	// @ts-ignore
	compilerOptions,
});
plugin.setConfig(mockAppConfig as any);

const renderer = (plugin as any).initializeRenderer();
console.log('Renderer Compiler Options:', JSON.stringify(renderer.compilerOptions, null, 2));

if (renderer.compilerOptions.remarkPlugins.includes('remark-gfm')) {
	console.log('SUCCESS: remarkPlugins forwarded to Renderer');
} else {
	console.log('FAILURE: remarkPlugins NOT forwarded to Renderer');
}

console.log('\n--- React Mode ---');
const reactPlugin = mdxPlugin({
	// @ts-ignore
	compilerOptions: { ...compilerOptions, jsxImportSource: 'react' },
});
reactPlugin.setConfig(mockAppConfig as any);

const reactRenderer = (reactPlugin as any).initializeRenderer();
console.log('React Renderer Compiler Options:', JSON.stringify(reactRenderer.compilerOptions, null, 2));

if (reactRenderer.compilerOptions.remarkPlugins.includes('remark-gfm')) {
	console.log('SUCCESS: remarkPlugins forwarded to React Renderer');
} else {
	console.log('FAILURE: remarkPlugins NOT forwarded to React Renderer');
}
