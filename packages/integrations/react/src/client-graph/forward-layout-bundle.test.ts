import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createClientGraphBoundaryPlugin } from './boundary-plugin.ts';
import { RolldownBuildAdapter } from '../../../../core/src/build/rolldown/rolldown-build-adapter.ts';
import { assertBuildSucceeded } from '../../../../core/src/build/build-log.ts';

/**
 * A page whose `layout` callback forwards the page's locals to a plain layout.
 *
 * The page imports `auth.server` for its `middleware`. The browser bundle must not contain it, and a forwarded
 * factory that imports server code must fail the browser build instead of leaking it.
 */
describe('browser bundle of a page that forwards locals to a layout', () => {
	function buildPage(files: Record<string, string>) {
		const tempDir = path.fromNative(mkdtempSync(path.join(tmpdir(), 'eco-forward-bundle-')));
		const pagesDir = path.join(tempDir, 'pages');
		mkdirSync(pagesDir);
		for (const [name, source] of Object.entries(files)) {
			writeFileSync(path.join(pagesDir, name), source);
		}
		const entrypoint = path.join(pagesDir, 'entry.ts');
		const build = () =>
			new RolldownBuildAdapter().build({
				environment: 'browser' as const,
				entrypoints: [entrypoint],
				outdir: path.join(tempDir, 'dist'),
				root: tempDir,
				target: 'browser',
				format: 'esm',
				plugins: [createClientGraphBoundaryPlugin()],
			});
		return { tempDir, build };
	}

	const eco = 'export const eco = { page: (options) => options, layout: (options) => options };';
	const shell = "import { eco } from './eco'; export const Shell = eco.layout({ render: () => 'shell' });";

	it('keeps the server middleware module out of the bundle when only the middleware option uses it', async () => {
		const { tempDir, build } = buildPage({
			'eco.ts': eco,
			'shell.ts': shell,
			'auth.server.ts': 'export const authMiddleware = "server-secret";',
			'entry.ts': [
				"import { eco } from './eco';",
				"import { Shell } from './shell';",
				"import { authMiddleware } from './auth.server.ts';",
				'export default eco.page({',
				"  cache: 'dynamic',",
				'  middleware: [authMiddleware],',
				'  layout: (forward) => forward(Shell, ({ locals }) => ({ user: locals.session.user })),',
				"  render: () => 'Dashboard',",
				'});',
			].join('\n'),
		});
		try {
			const result = await build();
			assertBuildSucceeded(result, 'Build failed');
			const output = readFileSync(result.outputs[0]!.path, 'utf8');
			expect(output).toContain('Dashboard');
			expect(output).toContain('shell');
			expect(output).not.toContain('server-secret');
			expect(output).not.toContain('authMiddleware');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('fails the browser build when the forwarded factory imports a server module', async () => {
		const { tempDir, build } = buildPage({
			'eco.ts': eco,
			'shell.ts': shell,
			'user.server.ts': 'export const readUser = () => "server-secret";',
			'entry.ts': [
				"import { eco } from './eco';",
				"import { Shell } from './shell';",
				"import { readUser } from './user.server.ts';",
				'export default eco.page({',
				"  cache: 'dynamic',",
				'  layout: (forward) => forward(Shell, ({ locals }) => ({ user: readUser(locals) })),',
				"  render: () => 'Dashboard',",
				'});',
			].join('\n'),
		});
		try {
			const result = await build();
			if (result.success) throw new Error('Expected the browser build to fail.');
			expect(result.logs.map((log) => log.message).join('\n')).toContain('server-only');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
