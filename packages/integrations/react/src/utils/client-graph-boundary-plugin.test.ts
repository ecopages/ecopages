import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type {
	EcoBuildOnLoadArgs,
	EcoBuildOnLoadResult,
	EcoBuildOnResolveArgs,
	EcoBuildOnResolveResult,
	EcoBuildPluginBuilder,
} from '@ecopages/core/build/build-types';
import { createClientGraphBoundaryPlugin } from './client-graph-boundary-plugin.ts';

type OnLoadRegistration = {
	options: { filter: RegExp; namespace?: string };
	callback: (
		args: EcoBuildOnLoadArgs,
	) => EcoBuildOnLoadResult | undefined | Promise<EcoBuildOnLoadResult | undefined>;
};

function createPluginTestHarness(pluginOptions?: Parameters<typeof createClientGraphBoundaryPlugin>[0]) {
	const onLoadRegistrations: OnLoadRegistration[] = [];
	const builder: EcoBuildPluginBuilder = {
		onResolve: (_options, _callback: (args: EcoBuildOnResolveArgs) => EcoBuildOnResolveResult | undefined) => {},
		onLoad: (options, callback) => {
			onLoadRegistrations.push({ options, callback });
		},
		module: (_specifier, _callback) => {},
	};

	const plugin = createClientGraphBoundaryPlugin(pluginOptions);
	plugin.setup(builder);

	const sourceLoader = onLoadRegistrations.find(({ options }) => options.filter.test('component.tsx'));
	if (!sourceLoader) {
		throw new Error('Source loader was not registered by client graph boundary plugin');
	}

	return {
		async transformFile(filePath: string): Promise<string | undefined> {
			const result = await sourceLoader.callback({ path: filePath });
			if (!result || typeof result.contents !== 'string') {
				return undefined;
			}
			return result.contents;
		},
	};
}

describe('createClientGraphBoundaryPlugin', () => {
	it('strips undeclared node and bare imports while keeping declared modules', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const filePath = join(tempDir, 'component.tsx');
		writeFileSync(
			filePath,
			[
				"import fs from 'node:fs';",
				"import { createColumnHelper } from '@tanstack/react-table';",
				"import leftPad from 'left-pad';",
				"const dynamicUndeclared = import('left-pad');",
				"const dynamicDeclared = import('@tanstack/react-table');",
				"const requiredUndeclared = require('left-pad');",
				"const dynamicFs = import('node:fs');",
				"const Component = eco.component({ dependencies: { modules: ['@tanstack/react-table{createColumnHelper}'] } });",
				'export default Component;',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();
			/** Forbidden dependencies correctly removed */
			expect(transformed).not.toContain("import fs from 'node:fs'");

			/** Safe UI imports are kept for ESBuild to natively treeshake */
			expect(transformed).toContain("import { createColumnHelper } from '@tanstack/react-table';");
			expect(transformed).toContain("import leftPad from 'left-pad';");

			/** dynamic loads */
			expect(transformed).toContain("const dynamicUndeclared = import('left-pad');");
			expect(transformed).toContain("const dynamicDeclared = import('@tanstack/react-table');");

			/**
			 * True forbidden dependencies (like `node:fs`) dynamically imported are stubbed
			 * to prevent hydration crashes if they are unreachable.
			 */
			expect(transformed).toContain('const dynamicFs = Promise.resolve({});');

			/**
			 * require is strictly matched out if it's node.
			 * The plugin strips requires only if they are forbidden.
			 * `leftPad` is allowed, so it is just left alone!
			 */
			expect(transformed).toContain("const requiredUndeclared = require('left-pad');");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('keeps imports declared via plugin options', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const filePath = join(tempDir, 'entry.tsx');
		writeFileSync(
			filePath,
			"import fs from 'node:fs';\nimport dayjs from 'dayjs';\nexport default dayjs() + String(!!fs);\n",
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness({ declaredModules: ['dayjs'] });
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();
			expect(transformed).toContain("import dayjs from 'dayjs';");
			expect(transformed).not.toContain("import fs from 'node:fs';");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('keeps relative imports untouched', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const filePath = join(tempDir, 'entry.tsx');
		writeFileSync(filePath, "import { helper } from './helper';\nexport default helper;\n", 'utf-8');

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeUndefined();
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('keeps project alias imports untouched', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const filePath = join(tempDir, 'entry.tsx');
		writeFileSync(filePath, "import { Counter } from '@/components/counter';\nexport default Counter;\n", 'utf-8');

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeUndefined();
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('surgically removes undeclared named imports when using pkg{named} grammar for forbidden modules', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const filePath = join(tempDir, 'entry.tsx');
		writeFileSync(
			filePath,
			[
				"import { readFileSync, writeFileSync } from 'node:fs';",
				"import { createColumnHelper, useReactTable } from '@tanstack/react-table';",
				"const Component = eco.component({ dependencies: { modules: ['node:fs{readFileSync}'] } });",
				'export default Component;',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();

			/**
			 * We declared `node:fs{readFileSync}` is allowed.
			 * So `readFileSync` stays, but `writeFileSync` MUST be surgically removed
			 * from the import specifiers since it's a forbidden module that wasn't declared.
			 */
			expect(transformed).toContain("import { readFileSync } from 'node:fs';");
			expect(transformed).not.toContain('writeFileSync');

			/**
			 * `react-table` is completely safe UI code.
			 * Even though it wasn't explicitly declared, we don't prune safe imports.
			 * We let ESBuild safely treeshake `createColumnHelper` and `useReactTable` natively.
			 */
			expect(transformed).toContain("import { createColumnHelper, useReactTable } from '@tanstack/react-table';");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('preserves local aliases and default import syntax when pruning forbidden named specifiers', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const filePath = join(tempDir, 'entry.tsx');
		writeFileSync(
			filePath,
			[
				"import fsDefault, { readFileSync as readText, writeFileSync } from 'node:fs';",
				"const Component = eco.component({ dependencies: { modules: ['node:fs{default,readFileSync}'] } });",
				'export default Component;',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();
			expect(transformed).toContain("import fsDefault, { readFileSync as readText } from 'node:fs';");
			expect(transformed).not.toContain('writeFileSync');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('rewrites default and namespace import combinations into valid syntax after pruning', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const filePath = join(tempDir, 'entry.tsx');
		writeFileSync(
			filePath,
			[
				"import fsDefault, * as fsNs from 'node:fs';",
				"const Component = eco.component({ dependencies: { modules: ['node:fs{*}'] } });",
				'export default Component;',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();
			expect(transformed).toContain("import * as fsNs from 'node:fs';");
			expect(transformed).not.toContain('import { * as fsNs }');
			expect(transformed).not.toContain('fsDefault, * as fsNs');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('fails when a named barrel re-export makes a server module client-reachable', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const entryPath = join(tempDir, 'entry.tsx');
		const barrelPath = join(tempDir, 'barrel.ts');

		writeFileSync(
			entryPath,
			["import { db } from './barrel';", 'export default eco.page({', '\trender: () => String(db)', '});'].join(
				'\n',
			),
			'utf-8',
		);
		writeFileSync(
			barrelPath,
			["export { db } from './db.server';", "export { Button } from './button';"].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			await harness.transformFile(entryPath);

			await expect(harness.transformFile(barrelPath)).rejects.toThrow(
				"Forbidden client export from './db.server'",
			);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('prunes unreachable server-only named re-exports from shared barrels', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const entryPath = join(tempDir, 'entry.tsx');
		const barrelPath = join(tempDir, 'barrel.ts');

		writeFileSync(
			entryPath,
			[
				"import { Button } from './barrel';",
				'export default eco.page({',
				'\trender: () => <Button />',
				'});',
			].join('\n'),
			'utf-8',
		);
		writeFileSync(
			barrelPath,
			["export { Button } from './button';", "export { db } from './db.server';"].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			await harness.transformFile(entryPath);
			const transformed = await harness.transformFile(barrelPath);

			expect(transformed).toBeDefined();
			expect(transformed).toContain("export { Button } from './button';");
			expect(transformed).not.toContain("export { db } from './db.server';");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
