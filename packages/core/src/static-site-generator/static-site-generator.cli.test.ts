import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const cliPath = path.join(repoRoot, 'packages/ecopages/bin/cli.js');
let appDir: string | undefined;

afterEach(() => {
	if (appDir) rmSync(appDir, { recursive: true, force: true });
	appDir = undefined;
});

test('ecopages build finishes healthy exports after a Page data hook failure', { timeout: 120_000 }, () => {
	appDir = mkdtempSync(path.join(repoRoot, '.static-build-render-failure-'));
	symlinkSync(path.join(repoRoot, 'node_modules/.pnpm/node_modules'), path.join(appDir, 'node_modules'), 'dir');
	mkdirSync(path.join(appDir, 'src/pages'), { recursive: true });
	mkdirSync(path.join(appDir, 'src/includes'), { recursive: true });
	writeFileSync(
		path.join(appDir, 'eco.config.ts'),
		[
			"import { defineConfig } from '@ecopages/core/config';",
			"import { ecopagesJsxPlugin } from '@ecopages/ecopages-jsx';",
			'export default defineConfig({ integrations: [ecopagesJsxPlugin()], sitemap: { enabled: true } });',
		].join('\n'),
	);
	writeFileSync(
		path.join(appDir, 'app.ts'),
		[
			"import { createApp } from '@ecopages/core/create-app';",
			'const app = await createApp();',
			'await app.start();',
		].join('\n'),
	);
	writeFileSync(
		path.join(appDir, 'src/pages/broken.tsx'),
		[
			"import { eco } from '@ecopages/core';",
			"export default eco.page({ staticProps: () => { throw new Error('static props failed intentionally'); }, render: () => 'broken' });",
		].join('\n'),
	);
	writeFileSync(
		path.join(appDir, 'src/pages/healthy.tsx'),
		[
			"import { eco } from '@ecopages/core';",
			"export default eco.page({ render: () => '<main>healthy</main>' });",
		].join('\n'),
	);
	writeFileSync(
		path.join(appDir, 'src/includes/html.tsx'),
		[
			"import type { HtmlTemplateProps } from '@ecopages/core';",
			"import { eco } from '@ecopages/core';",
			'export default eco.html({ render: ({ children }: HtmlTemplateProps) => `<html><body>${children}</body></html>` });',
		].join('\n'),
	);

	const runBuild = (args: string[]) =>
		spawnSync(process.execPath, [cliPath, 'build', '--runtime', 'node', ...args], {
			cwd: appDir,
			env: { ...process.env, VITEST: '', NODE_ENV: 'production' },
			encoding: 'utf8',
			timeout: 90_000,
		});

	const failingBuild = runBuild([]);
	expect(failingBuild.error).toBeUndefined();
	expect(failingBuild.status).toBe(1);
	expect(`${failingBuild.stdout}${failingBuild.stderr}`).toContain('http://localhost:3000/broken');
	expect(`${failingBuild.stdout}${failingBuild.stderr}`).toContain('static props failed intentionally');
	expect(existsSync(path.join(appDir, 'dist/client/healthy.html'))).toBe(true);
	expect(existsSync(path.join(appDir, 'dist/client/sitemap.xml'))).toBe(true);
	expect(readFileSync(path.join(appDir, 'dist/client/sitemap.xml'), 'utf8')).toContain('/healthy');
	expect(existsSync(path.join(appDir, 'dist/client/broken.html'))).toBe(false);

	const continuedBuild = runBuild(['--keep-going']);
	expect(continuedBuild.error).toBeUndefined();
	expect(continuedBuild.status).toBe(0);
	expect(`${continuedBuild.stdout}${continuedBuild.stderr}`).toContain('http://localhost:3000/broken');
});
