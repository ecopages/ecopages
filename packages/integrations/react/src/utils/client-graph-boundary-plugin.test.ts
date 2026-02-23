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
				"const dynamicBad = import('left-pad');",
				"const dynamicGood = import('@tanstack/react-table');",
				"const requiredBad = require('left-pad');",
				"const Component = eco.component({ dependencies: { modules: ['@tanstack/react-table{createColumnHelper}'] } });",
				'export default Component;',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();
			expect(transformed).not.toContain("import fs from 'node:fs'");
			expect(transformed).toContain("import { createColumnHelper } from '@tanstack/react-table';");
			expect(transformed).not.toContain("import leftPad from 'left-pad';");
			expect(transformed).toContain('const dynamicBad = Promise.resolve({});');
			expect(transformed).toContain("const dynamicGood = import('@tanstack/react-table');");
			expect(transformed).toContain('const requiredBad = ({});');
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

	it('surgically removes undeclared named imports when using pkg{named} grammar', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'eco-client-graph-'));
		const filePath = join(tempDir, 'entry.tsx');
		writeFileSync(
			filePath,
			[
				"import { createColumnHelper, useReactTable } from '@tanstack/react-table';",
				"import type { TableOptions } from '@tanstack/react-table';",
				"const Component = eco.component({ dependencies: { modules: ['@tanstack/react-table{useReactTable}'] } });",
				'export default Component;',
			].join('\n'),
			'utf-8',
		);

		try {
			const harness = createPluginTestHarness();
			const transformed = await harness.transformFile(filePath);

			expect(transformed).toBeDefined();
			// should have dropped createColumnHelper
			expect(transformed).toContain("import { useReactTable } from '@tanstack/react-table';");
			expect(transformed).not.toContain('createColumnHelper');
			// TableOptions wasn't allowed, so the whole line should be dropped.
			expect(transformed).not.toContain('TableOptions');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
