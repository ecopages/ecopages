import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createClientGraphBoundaryPlugin } from './boundary-plugin.ts';
import { RolldownBuildAdapter } from '../../../../core/src/build/rolldown/rolldown-build-adapter.ts';
import { assertBuildSucceeded } from '../../../../core/src/build/build-log.ts';

/**
 * A page whose layout entry reads request data in its `props` factory.
 *
 * The factory runs only on the server: the browser renders each tier from the props the server shipped as
 * `tiers`. Server code an inline factory uses must stay out of the browser bundle, and server code that would
 * still reach the bundle must fail the browser build instead of leaking or dropping the tier.
 */
describe('browser bundle of a page whose layout entry reads request data', () => {
	function buildPage(files: Record<string, string>, options: { boundary: boolean } = { boundary: true }) {
		const tempDir = path.fromNative(mkdtempSync(path.join(tmpdir(), 'eco-layout-entry-bundle-')));
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
				plugins: options.boundary ? [createClientGraphBoundaryPlugin()] : [],
			});
		return { tempDir, build };
	}

	async function buildOutput(files: Record<string, string>): Promise<string> {
		const { tempDir, build } = buildPage(files);
		try {
			const result = await build();
			assertBuildSucceeded(result, 'Build failed');
			return readFileSync(result.outputs[0]!.path, 'utf8');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	}

	async function buildError(files: Record<string, string>, options?: { boundary: boolean }): Promise<string> {
		const { tempDir, build } = buildPage(files, options);
		try {
			const result = await build();
			if (result.success) throw new Error('Expected the browser build to fail.');
			return result.logs.map((log) => log.message).join('\n');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	}

	const eco = 'export const eco = { page: (options) => options, layout: (options) => options };';
	const shell = "import { eco } from './eco'; export const Shell = eco.layout({ render: () => 'shell-layout' });";
	const userServer = 'export const readUser = (locals) => `server-secret:${locals.session}`;';
	const sharedLayout = [
		"import { Shell } from './shell';",
		"import { readUser } from './user.server.ts';",
		'export const sessionLayout = { component: Shell, props: ({ locals }) => ({ user: readUser(locals) }) };',
	].join('\n');

	it('keeps the server middleware module out of the bundle when only the middleware option uses it', async () => {
		const output = await buildOutput({
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
				'  layout: { component: Shell, props: ({ locals }) => ({ user: locals.session.user }) },',
				"  render: () => 'Dashboard',",
				'});',
			].join('\n'),
		});

		expect(output).toContain('Dashboard');
		expect(output).toContain('shell-layout');
		expect(output).not.toContain('server-secret');
		expect(output).not.toContain('authMiddleware');
	});

	it('removes an inline entry factory and the server module only it uses, keeping the layout component', async () => {
		const output = await buildOutput({
			'eco.ts': eco,
			'shell.ts': shell,
			'user.server.ts': userServer,
			'entry.ts': [
				"import { eco } from './eco';",
				"import { Shell } from './shell';",
				"import { readUser } from './user.server.ts';",
				'export default eco.page({',
				"  cache: 'dynamic',",
				'  layout: { component: Shell, props: ({ locals }) => ({ user: readUser(locals), marker: "factory-body" }) },',
				"  render: () => 'Dashboard',",
				'});',
			].join('\n'),
		});

		expect(output).toContain('shell-layout');
		expect(output).toMatch(/layout:\s*\{\s*component:\s*Shell\s*\}/);
		expect(output).not.toContain('factory-body');
		expect(output).not.toContain('readUser');
		expect(output).not.toContain('server-secret');
	});

	it('removes the factory of an inline entry inside a layout array and keeps every tier', async () => {
		const output = await buildOutput({
			'eco.ts': eco,
			'shell.ts': shell,
			'user.server.ts': userServer,
			'entry.ts': [
				"import { eco } from './eco';",
				"import { Shell } from './shell';",
				"import { readUser } from './user.server.ts';",
				'export default eco.page({',
				"  cache: 'dynamic',",
				'  layout: [Shell, { component: Shell, props: ({ locals }) => ({ user: readUser(locals) }) }],',
				"  render: () => 'Dashboard',",
				'});',
			].join('\n'),
		});

		expect(output).toMatch(/layout:\s*\[\s*Shell,\s*\{\s*component:\s*Shell\s*\}\s*\]/);
		expect(output).not.toContain('readUser');
		expect(output).not.toContain('server-secret');
	});

	it.each([
		['as const', '[{ component: Shell, props: () => ({ user: readUser() }) }] as const'],
		['satisfies', '[{ component: Shell, props: () => ({ user: readUser() }) }] satisfies unknown[]'],
		['parentheses', '([{ component: Shell, props: () => ({ user: readUser() }) } as const])'],
	])(
		'removes the factory of an inline entry wrapped in %s, with the plain module only it uses',
		async (_wrapper, layout) => {
			const output = await buildOutput({
				'eco.ts': eco,
				'shell.ts': shell,
				'db.ts': "export const readUser = () => 'db-secret';",
				'entry.ts': [
					"import { eco } from './eco';",
					"import { Shell } from './shell';",
					"import { readUser } from './db';",
					'export default eco.page({',
					"  cache: 'dynamic',",
					`  layout: ${layout},`,
					"  render: () => 'Dashboard',",
					'});',
				].join('\n'),
			});

			expect(output).toContain('shell-layout');
			expect(output).not.toContain('readUser');
			expect(output).not.toContain('db-secret');
		},
	);

	it('fails the browser build when a shared entry imported from another module uses a server module', async () => {
		const message = await buildError({
			'eco.ts': eco,
			'shell.ts': shell,
			'user.server.ts': userServer,
			'session-layout.ts': sharedLayout,
			'entry.ts': [
				"import { eco } from './eco';",
				"import { sessionLayout } from './session-layout';",
				'export default eco.page({',
				"  cache: 'dynamic',",
				'  layout: sessionLayout,',
				"  render: () => 'Dashboard',",
				'});',
			].join('\n'),
		});

		expect(message).toContain("Forbidden client import './user.server.ts'");
		expect(message).toContain('session-layout.ts');
	});

	it('fails the browser build when a shared entry inside a layout array uses a server module', async () => {
		const message = await buildError({
			'eco.ts': eco,
			'shell.ts': shell,
			'user.server.ts': userServer,
			'session-layout.ts': sharedLayout,
			'entry.ts': [
				"import { eco } from './eco';",
				"import { Shell } from './shell';",
				"import { sessionLayout } from './session-layout';",
				'export default eco.page({',
				"  cache: 'dynamic',",
				'  layout: [Shell, sessionLayout],',
				"  render: () => 'Dashboard',",
				'});',
			].join('\n'),
		});

		expect(message).toContain("Forbidden client import './user.server.ts'");
	});

	it('keeps a shared entry that uses no server module, factory included', async () => {
		const output = await buildOutput({
			'eco.ts': eco,
			'shell.ts': shell,
			'session-layout.ts': [
				"import { Shell } from './shell';",
				'export const sessionLayout = { component: Shell, props: ({ locals }) => ({ user: locals.session, marker: "shared-body" }) };',
			].join('\n'),
			'entry.ts': [
				"import { eco } from './eco';",
				"import { sessionLayout } from './session-layout';",
				'export default eco.page({',
				"  cache: 'dynamic',",
				'  layout: sessionLayout,',
				"  render: () => 'Dashboard',",
				'});',
			].join('\n'),
		});

		expect(output).toContain('layout: sessionLayout');
		expect(output).toContain('shared-body');
	});

	it('fails the browser build through the server-only guard when no boundary removes the server import', async () => {
		const message = await buildError(
			{
				'eco.ts': eco,
				'shell.ts': shell,
				'user.server.ts': userServer,
				'session-layout.ts': sharedLayout,
				'entry.ts': [
					"import { eco } from './eco';",
					"import { sessionLayout } from './session-layout';",
					"export default eco.page({ cache: 'dynamic', layout: sessionLayout, render: () => 'Dashboard' });",
				].join('\n'),
			},
			{ boundary: false },
		);

		expect(message).toContain('server-only module');
		expect(message).toContain('user.server.ts');
	});
});
