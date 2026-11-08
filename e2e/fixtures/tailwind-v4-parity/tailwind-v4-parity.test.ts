import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFixtureApp } from '../../../packages/core/__fixtures__/app/copy-fixture-app.ts';
import { checkClientAssetReachability } from '../../utils/client-asset-reachability.ts';

const cliPath = fileURLToPath(new URL('../../../packages/ecopages/bin/cli.js', import.meta.url));
const playgrounds = {
	postcss: fileURLToPath(new URL('../../../playground/tailwind-v4', import.meta.url)),
	lightningcss: fileURLToPath(new URL('../../../playground/tailwind-v4-lightningcss', import.meta.url)),
};

type Build = { appDir: string; clientDir: string };

/** A page whose only styling is the utility class the acceptance names. */
const ROSE_PAGE = `import { eco } from '@ecopages/core';

export default eco.page({
	render: () => '<main class="bg-rose-600">rose</main>',
});
`;

function build(source: string): Build {
	const appDir = copyFixtureApp(source);
	writeFileSync(path.join(appDir, 'src/pages/rose.tsx'), ROSE_PAGE);
	const built = spawnSync(process.execPath, [cliPath, 'build', '--runtime', 'node'], {
		cwd: appDir,
		env: { ...process.env, VITEST: '', NODE_ENV: 'production' },
		encoding: 'utf8',
		timeout: 180_000,
	});
	expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);
	return { appDir, clientDir: path.join(appDir, 'dist', 'client') };
}

/** The class names every emitted stylesheet defines. */
function definedClasses(clientDir: string): Set<string> {
	const classes = new Set<string>();
	const assets = path.join(clientDir, 'assets');
	for (const file of readdirSync(assets).filter((name) => name.endsWith('.css'))) {
		const css = readFileSync(path.join(assets, file), 'utf8');
		for (const [, name] of css.matchAll(/\.((?:\\.|[A-Za-z_-])(?:\\.|[\w-])*)/gu)) classes.add(name!);
	}
	return classes;
}

describe('the Tailwind v4 playgrounds, in a production build', () => {
	const builds: Partial<Record<keyof typeof playgrounds, Build>> = {};

	beforeAll(() => {
		builds.postcss = build(playgrounds.postcss);
		builds.lightningcss = build(playgrounds.lightningcss);
	}, 400_000);

	afterAll(() => {
		for (const built of Object.values(builds)) rmSync(built.appDir, { recursive: true, force: true });
	});

	it('defines the utility class a component uses, with no PostCSS in the app', () => {
		expect(definedClasses(builds.lightningcss!.clientDir)).toContain('bg-rose-600');
		expect(existsSync(path.join(playgrounds.lightningcss, 'node_modules', 'postcss'))).toBe(false);
	});

	it('defines the same classes as the PostCSS preset', () => {
		const postcss = definedClasses(builds.postcss!.clientDir);
		const lightningcss = definedClasses(builds.lightningcss!.clientDir);

		expect(postcss).toContain('bg-rose-600');
		expect([...lightningcss].filter((name) => !postcss.has(name))).toEqual([]);
		expect([...postcss].filter((name) => !lightningcss.has(name))).toEqual([]);
	});

	it('leaves no file missing for the reachability check', () => {
		expect(checkClientAssetReachability(builds.lightningcss!.clientDir).missing).toEqual([]);
	});
});
