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
			runtimeSpecifierMap: new Map(),
			resolveVendorUrl: async (specifier) => specifier,
		});

		expect(code).toContain(`"${DEV_TRANSFORM_URL_PREFIX}/layouts/sidebar-link.js?v=`);
		expect(code).not.toContain(linkPath);
		expect(dependencies).toEqual([linkPath]);
	});
});
