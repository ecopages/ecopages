import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';
import { describe, expect, it } from 'vitest';
import type { EcoBuildPlugin } from '@ecopages/core/integration';
import { RolldownBuildAdapter } from '../../../../core/src/build/rolldown/rolldown-build-adapter.ts';
import { assertBuildFailed } from '../../../../core/src/__fixtures__/build/build-result.ts';
import { assertBuildSucceeded } from '../../../../core/src/build/build-log.ts';
import { createClientGraphBoundaryPlugin, createForeignBoundaryPlugin } from './boundary-plugin.ts';
import { rewriteForeignImports } from './foreign-boundary-rewrite.ts';

const isForeignFile = (filePath: string) => filePath.endsWith('.lit.tsx');

function createProject() {
	const root = path.fromNative(realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-foreign-boundary-'))));
	mkdirSync(path.join(root, 'components'));
	writeFileSync(path.join(root, 'components/counter.lit.tsx'), 'export default 1; export const Named = 2;');
	writeFileSync(path.join(root, 'components/button.tsx'), 'export default () => null; export const Other = 1;');
	writeFileSync(path.join(root, 'components/index.ts'), "export { default as Counter } from './counter.lit.tsx';");
	return root;
}

function rewrite(root: string, code: string, file = 'island.tsx') {
	return rewriteForeignImports(code, path.join(root, file), { projectRoot: root, isForeignFile });
}

describe('rewriteForeignImports', () => {
	it('leaves a module that imports no foreign-owned module untouched', () => {
		const root = createProject();
		try {
			const code = [
				"import React from 'react';",
				"import Button, { Other } from './components/button.tsx';",
				"export * from './components/button.tsx';",
				'export default () => React.createElement(Button, null, Other);',
			].join('\n');
			expect(rewrite(root, code)).toBeUndefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('wraps default, named and aliased imports of a foreign-owned module', () => {
		const root = createProject();
		try {
			const output = rewrite(
				root,
				"import Counter, { Named as Alias } from './components/counter.lit.tsx';\nexport default () => [Counter, Alias];",
			)!;
			expect(output).toContain('@ecopages/react/foreign-boundary');
			expect(output).toMatch(/"default" as (__eco_foreign_\d+), "Named" as (__eco_foreign_\d+)/);
			expect(output).toContain('const Counter = __ecoForeignBoundary(');
			expect(output).toContain('const Alias = __ecoForeignBoundary(');
			expect(output.split('\n').length).toBe(2);
			expect(rewrite(root, output)).toBeUndefined();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('wraps a namespace import and keeps type imports out of the value bindings', () => {
		const root = createProject();
		try {
			const output = rewrite(
				root,
				"import * as Lit from './components/counter.lit.tsx';\nimport type { Props } from './components/counter.lit.tsx';\nexport const x = Lit;",
			)!;
			expect(output).toContain('const Lit = __ecoForeignBoundaryNamespace(');
			expect(output).toContain("import type { Props } from './components/counter.lit.tsx'");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('wraps the names a barrel re-exports from a foreign-owned module', () => {
		const root = createProject();
		try {
			const output = rewrite(
				root,
				"export { default as Counter, Named } from './counter.lit.tsx';\nexport { Other } from './button.tsx';",
				'components/index.ts',
			)!;
			expect(output).toMatch(
				/export \{ __eco_foreign_boundary_0 as "Counter", __eco_foreign_boundary_1 as "Named" \}/,
			);
			expect(output).toContain("export { Other } from './button.tsx';");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('wraps the imports of compiled MDX', () => {
		const root = createProject();
		try {
			const code = [
				"import {jsx as _jsx} from 'react/jsx-runtime';",
				"import Counter from './components/counter.lit.tsx';",
				'export default function MDXContent() { return _jsx(Counter, {}); }',
			].join('\n');
			const output = rewriteForeignImports(code, path.join(root, 'page.mdx'), {
				projectRoot: root,
				isForeignFile,
			})!;
			expect(output).toContain('const Counter = __ecoForeignBoundary(');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe('createForeignBoundaryPlugin in a build', () => {
	const boundaryModule = path.resolve(
		path.dirname(path.fromFileUrl(import.meta.url)),
		'../hydration/browser/foreign-boundary.ts',
	);
	const resolveBoundaryPlugin: EcoBuildPlugin = {
		name: 'test-resolve-foreign-boundary',
		setup(build) {
			build.onResolve({ filter: /^@ecopages\/react\/foreign-boundary$/ }, () => ({ path: boundaryModule }));
		},
	};

	async function buildIsland(root: string, source: string, withPlugin: boolean): Promise<string> {
		const entry = path.join(root, 'island.tsx');
		writeFileSync(entry, source);
		const result = await new RolldownBuildAdapter().build({
			environment: 'browser',
			entrypoints: { island: entry },
			outdir: path.join(root, withPlugin ? 'dist-with' : 'dist-without'),
			root,
			target: 'browser',
			format: 'esm',
			external: ['react'],
			plugins: [
				resolveBoundaryPlugin,
				...(withPlugin ? [createForeignBoundaryPlugin({ projectRoot: root, isForeignFile })] : []),
			],
		});
		assertBuildSucceeded(result, 'Build failed');
		return readFileSync(result.outputs.find((output) => output.path.endsWith('.js'))!.path, 'utf8');
	}

	it('ships the boundary only to an island that imports a foreign-owned Component', async () => {
		const root = createProject();
		try {
			const foreign = await buildIsland(
				root,
				"import Counter from './components/counter.lit.tsx';\nexport default () => Counter;",
				true,
			);
			expect(foreign).toContain('eco-foreign-subtree');

			const reactOnlySource = "import Button from './components/button.tsx';\nexport default () => Button;";
			const withPlugin = await buildIsland(root, reactOnlySource, true);
			const withoutPlugin = await buildIsland(root, reactOnlySource, false);
			expect(withPlugin).toBe(withoutPlugin);
			expect(withPlugin).not.toContain('eco-foreign-subtree');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('leaves a module only another entry reaches alone and fails one that both reach', async () => {
		const root = createProject();
		try {
			const island = path.join(root, 'island.tsx');
			const other = path.join(root, 'other-entry.ts');
			writeFileSync(island, "import Button from './components/button.tsx';\nexport default Button;");
			writeFileSync(other, "import { Counter } from './components/index.ts';\nconsole.log(Counter);");
			const build = (entrypoints: Record<string, string>) =>
				new RolldownBuildAdapter().build({
					environment: 'browser',
					entrypoints,
					outdir: path.join(root, 'dist'),
					root,
					target: 'browser',
					format: 'esm',
					external: ['react'],
					plugins: [
						resolveBoundaryPlugin,
						createClientGraphBoundaryPlugin({
							absWorkingDir: root,
							projectRoot: root,
							entrypointFile: island,
							groupedEntrypointFiles: [island],
						}),
						createForeignBoundaryPlugin({ projectRoot: root, isForeignFile }),
					],
				});

			const alone = await build({ island, other });
			assertBuildSucceeded(alone, 'Build failed');
			expect(alone.outputs.map((output) => readFileSync(output.path, 'utf8')).join('\n')).not.toContain(
				'eco-foreign-subtree',
			);

			writeFileSync(island, "import { Counter } from './components/index.ts';\nexport default Counter;");
			const shared = await build({ island, other });
			assertBuildFailed(shared);
			expect(JSON.stringify(shared.logs)).toContain('one module has one compiled form');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
