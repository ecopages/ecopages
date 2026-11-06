import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEV_TRANSFORM_URL_PREFIX } from './dev-transform-url.ts';
import { rewriteModuleImports } from './dev-transform-import-rewriter.ts';

const tempRoots: string[] = [];

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe('rewriteModuleImports', () => {
	it('rewrites an absolute specifier of a project file to its dev-transform URL', async () => {
		const rootDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dev-transform-absolute-import-')));
		tempRoots.push(rootDir);
		const srcDir = path.join(rootDir, 'src');
		const linkPath = path.join(srcDir, 'layouts', 'sidebar-link.tsx');
		fs.mkdirSync(path.dirname(linkPath), { recursive: true });
		fs.writeFileSync(linkPath, 'export const SidebarLink = () => null;\n');

		const { code, dependencies } = await rewriteModuleImports({
			code: `import { SidebarLink as __ecoPlainModuleComponent0 } from ${JSON.stringify(linkPath)};\n`,
			sourcePath: path.join(srcDir, 'pages', 'index.tsx'),
			srcDir,
			projectRoot: rootDir,
			resolveVendorImport: async (specifier) => ({ url: specifier, commonJs: false }),
		});

		expect(code).toContain(`"${DEV_TRANSFORM_URL_PREFIX}/layouts/sidebar-link.js?v=`);
		expect(code).not.toContain(linkPath);
		expect(dependencies).toEqual([linkPath]);
	});

	describe('a named import from a CommonJS vendor', () => {
		const rewriteVendorImports = async (code: string) => {
			const rootDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dev-transform-cjs-import-')));
			tempRoots.push(rootDir);
			const srcDir = path.join(rootDir, 'src');
			const result = await rewriteModuleImports({
				code,
				sourcePath: path.join(srcDir, 'pages', 'index.js'),
				srcDir,
				projectRoot: rootDir,
				resolveVendorImport: async (specifier) => ({
					url: `/assets/vendors/${specifier.replaceAll('/', '-')}.js`,
					commonJs: specifier.startsWith('react'),
				}),
			});
			return result.code;
		};

		const evaluate = async (code: string, vendors: Record<string, unknown>): Promise<Record<string, unknown>> => {
			let source = code;
			for (const [url, exports] of Object.entries(vendors)) {
				const vendorSource = `export default ${JSON.stringify(exports)};`;
				source = source.replaceAll(url, `data:text/javascript,${encodeURIComponent(vendorSource)}`);
			}
			return import(`data:text/javascript,${encodeURIComponent(source)}`);
		};

		it('reads the names from the default export, which holds module.exports', async () => {
			const code = await rewriteVendorImports(
				[
					'import React, { useState, version as reactVersion } from "react";',
					'import { jsx } from "react/jsx-runtime";',
					'import * as ReactNamespace from "react";',
					'import { default as ReactDefault } from "react";',
					'export const picked = { useState, reactVersion, jsx, namespaceVersion: ReactNamespace.version, sameDefault: ReactNamespace.default === React && ReactDefault === React };',
				].join('\n'),
			);

			const module = await evaluate(code, {
				'/assets/vendors/react.js': { useState: 'useState', version: '19' },
				'/assets/vendors/react-jsx-runtime.js': { jsx: 'jsx' },
			});

			expect(module.picked).toEqual({
				useState: 'useState',
				reactVersion: '19',
				jsx: 'jsx',
				namespaceVersion: '19',
				sameDefault: true,
			});
		});

		it('re-exports named bindings of a CommonJS vendor', async () => {
			const code = await rewriteVendorImports('export { useState, version as reactVersion } from "react";');

			const module = await evaluate(code, {
				'/assets/vendors/react.js': { useState: 'useState', version: '19' },
			});

			expect(module).toMatchObject({ useState: 'useState', reactVersion: '19' });
		});

		it('re-exports the namespace and the default export of a CommonJS vendor', async () => {
			const code = await rewriteVendorImports(
				[
					'export * as ReactNamespace from "react";',
					'export { default as React, "version" as "react-version" } from "react";',
				].join('\n'),
			);

			const module = await evaluate(code, { '/assets/vendors/react.js': { version: '19' } });

			expect(module.ReactNamespace).toEqual({ version: '19', default: { version: '19' } });
			expect(module.React).toEqual({ version: '19' });
			expect(module['react-version']).toBe('19');
		});

		it.each([
			['a side-effect import', 'import "react";', 'import "/assets/vendors/react.js";'],
			['a default-only import', 'import React from "react";', 'import React from "/assets/vendors/react.js";'],
			['export * from', 'export * from "react";', 'export * from "/assets/vendors/react.js";'],
			[
				'import()',
				'export const load = () => import("react");',
				'export const load = () => import("/assets/vendors/react.js");',
			],
		])('only points %s of a CommonJS vendor at its URL', async (_label, source, expected) => {
			expect(await rewriteVendorImports(source)).toBe(expected);
		});

		it('leaves the named imports of an ES module vendor as they are', async () => {
			const code = await rewriteVendorImports('import { QueryClient } from "@tanstack/query-core";');

			expect(code).toBe('import { QueryClient } from "/assets/vendors/@tanstack-query-core.js";');
		});
	});
});
