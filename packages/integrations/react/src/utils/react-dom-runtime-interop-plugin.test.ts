import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type {
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildOnResolveArgs,
	EcoBuildOnResolveResult,
	EcoBuildPluginBuilder,
} from '@ecopages/core/plugins/integration-plugin';
import { createReactDomRuntimeInteropPlugin } from './react-dom-runtime-interop-plugin.ts';

type OnLoadRegistration = {
	options: { filter: RegExp; namespace?: string };
	callback: (
		args: EcoBuildOnLoadArgs,
	) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>;
};

type OnResolveRegistration = {
	options: { filter: RegExp; namespace?: string };
	callback: (
		args: EcoBuildOnResolveArgs,
	) => EcoBuildOnResolveResult | undefined | Promise<EcoBuildOnResolveResult | undefined>;
};

function createPluginHarness() {
	const onResolveRegistrations: OnResolveRegistration[] = [];
	const onLoadRegistrations: OnLoadRegistration[] = [];
	const builder: EcoBuildPluginBuilder = {
		onResolve: (options, callback: (args: EcoBuildOnResolveArgs) => EcoBuildOnResolveResult | undefined) => {
			onResolveRegistrations.push({ options, callback });
		},
		onLoad: (options, callback) => {
			onLoadRegistrations.push({ options, callback });
		},
		module: (_specifier, _callback) => {},
	};

	const plugin = createReactDomRuntimeInteropPlugin();
	plugin.setup(builder);

	const reactDomLoader = onLoadRegistrations.find(({ options }) => options.filter.test('/tmp/react-dom/index.js'));
	if (!reactDomLoader) {
		throw new Error('React DOM runtime interop plugin did not register its loader');
	}

	return {
		reactDomLoader,
		onResolveRegistrations,
	};
}

describe('createReactDomRuntimeInteropPlugin', () => {
	it('rewrites react-dom CommonJS react requires into an ESM namespace import', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-react-dom-interop-'));
		const filePath = path.join(tempDir, 'node_modules', 'react-dom', 'cjs', 'react-dom.production.js');
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, "var React = require('react');\nmodule.exports = React.version;", 'utf8');

		try {
			const { reactDomLoader } = createPluginHarness();
			const result = await reactDomLoader.callback({ path: filePath });

			expect(result).toBeDefined();
			expect(result).toMatchObject({
				loader: 'js',
				resolveDir: path.dirname(filePath),
			});
			expect(result?.contents).toContain("import * as __ecopages_react_runtime from 'react';");
			expect(result?.contents).toContain('var React = __ecopages_react_runtime;');
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('leaves react-dom files without react requires untouched', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-react-dom-interop-'));
		const filePath = path.join(tempDir, 'node_modules', 'react-dom', 'client.js');
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, 'export const version = 1;', 'utf8');

		try {
			const { reactDomLoader } = createPluginHarness();
			const result = await reactDomLoader.callback({ path: filePath });
			expect(result).toBeUndefined();
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('allows overriding the injected React specifier', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-react-dom-interop-'));
		const filePath = path.join(tempDir, 'node_modules', 'react-dom', 'cjs', 'react-dom.production.js');
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, "var React = require('react');\nmodule.exports = React.version;", 'utf8');

		try {
			const onResolveRegistrations: OnResolveRegistration[] = [];
			const onLoadRegistrations: OnLoadRegistration[] = [];
			const plugin = createReactDomRuntimeInteropPlugin({ reactSpecifier: '/assets/vendors/react.js' });
			plugin.setup({
				onResolve: (options, callback) => {
					onResolveRegistrations.push({ options, callback });
				},
				onLoad: (options, callback) => {
					onLoadRegistrations.push({ options, callback });
				},
				module: (_specifier, _callback) => {},
			});

			const loader = onLoadRegistrations.find(({ options }) => options.filter.test('/tmp/react-dom/index.js'));
			expect(loader).toBeDefined();
			const result = await loader?.callback({ path: filePath });

			expect(onResolveRegistrations).toHaveLength(1);
			expect(onResolveRegistrations[0]?.options.filter.test('/assets/vendors/react.js')).toBe(true);
			expect(
				await onResolveRegistrations[0]?.callback({
					path: '/assets/vendors/react.js',
					importer: filePath,
					namespace: 'file',
				}),
			).toEqual({
				path: '/assets/vendors/react.js',
				external: true,
			});
			expect(result?.contents).toContain("import * as __ecopages_react_runtime from '/assets/vendors/react.js';");
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
