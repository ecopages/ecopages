import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'vitest';
import type { EcoBuildOnResolveResult } from '../build/build-types.ts';
import { createAliasResolverPlugin } from './alias-resolver-plugin.ts';

test('createAliasResolverPlugin resolves @ aliases to concrete barrel targets', async () => {
	const rootDir = fs.mkdtempSync(path.join(tmpdir(), 'ecopages-alias-resolver-'));
	const srcDir = path.join(rootDir, 'src');
	const layoutDir = path.join(srcDir, 'layouts', 'base-layout');
	fs.mkdirSync(layoutDir, { recursive: true });
	fs.writeFileSync(path.join(layoutDir, 'base-layout.kita.tsx'), 'export const BaseLayout = {};\n', 'utf8');
	fs.writeFileSync(path.join(layoutDir, 'index.ts'), "export * from './base-layout.kita';\n", 'utf8');

	try {
		const registrations: Array<{
			filter: RegExp;
			callback: (args: {
				path: string;
			}) => EcoBuildOnResolveResult | undefined | Promise<EcoBuildOnResolveResult | undefined>;
		}> = [];
		const plugin = createAliasResolverPlugin(srcDir);

		plugin.setup({
			onResolve(options, callback) {
				registrations.push({ filter: options.filter, callback });
			},
			onLoad() {},
			module() {},
		});

		assert.equal(registrations.length, 1);
		assert.deepEqual(await registrations[0]?.callback({ path: '@/layouts/base-layout' }), {
			path: path.join(layoutDir, 'base-layout.kita.tsx'),
		});
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});
