import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import { FSRouterScanner } from './fs-router-scanner.ts';

test('FSRouterScanner scans dynamic routes in Node when module graph needs transpilation', async () => {
	const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-fs-router-scanner-node-'));
	const pagesDir = path.join(rootDir, 'src', 'pages');
	const dynamicDir = path.join(pagesDir, 'dynamic');
	const distDir = path.join(rootDir, '.eco');

	try {
		fs.mkdirSync(dynamicDir, { recursive: true });
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });

		fs.writeFileSync(
			path.join(rootDir, 'src', 'decorated.ts'),
			[
				'function sealed<T extends new (...args: never[]) => object>(target: T) {',
				'\treturn target;',
				'}',
				'@sealed',
				'export class DecoratedModule {}',
			].join('\n'),
		);

		fs.writeFileSync(
			path.join(dynamicDir, '[slug].kita.tsx'),
			[
				"import '../../decorated.ts';",
				'',
				'export const getStaticPaths = async () => ({',
				"\tpaths: [{ params: { slug: 'hello-world' } }],",
				'});',
				'',
				'export const getStaticProps = async () => ({ props: {} });',
				'',
				'export default async function Page() {',
				"\treturn '<div>Hello</div>';",
				'}',
			].join('\n'),
		);

		const scanner = new FSRouterScanner({
			dir: pagesDir,
			origin: 'http://localhost:3000',
			templatesExt: ['.kita.tsx'],
			options: {
				buildMode: false,
			},
			appConfig: {
				rootDir,
				absolutePaths: {
					distDir,
				},
			} as unknown as EcoPagesAppConfig,
		});

		const routes = await scanner.scan();

		assert.equal(routes['http://localhost:3000/dynamic/hello-world']?.kind, 'dynamic');
		assert.equal(routes['http://localhost:3000/dynamic/hello-world']?.pathname, '/dynamic/[slug]');

		const transpiledModulesDir = path.join(distDir, '.server-route-modules');
		assert.equal(fs.existsSync(transpiledModulesDir), true);

		const transpiledFiles = fs.readdirSync(transpiledModulesDir).filter((file) => file.endsWith('.js'));
		assert.ok(transpiledFiles.length > 0);
	} finally {
		fs.rmSync(rootDir, { recursive: true, force: true });
	}
});
