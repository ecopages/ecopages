import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePackagePath, toPackagePath } from './package-path.ts';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(file: string, content: string): string {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, content);
	return file;
}

/** An app whose `some-lib` lives in a pnpm-style store folder of `version`, linked from `node_modules`. */
function pnpmApp() {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-package-path-')));
	roots.push(root);
	const storeDir = (version: string) =>
		path.join(root, 'node_modules', '.pnpm', `some-lib@${version}`, 'node_modules', 'some-lib');
	const install = (version: string) => {
		write(path.join(storeDir(version), 'package.json'), JSON.stringify({ name: 'some-lib', version }));
		write(path.join(storeDir(version), 'css', 'style.css'), `.v${version.replace(/\./g, '')} {}`);
		symlinkSync(storeDir(version), path.join(root, 'node_modules', 'some-lib'), 'junction');
	};
	return { root, storeDir, install };
}

describe('toPackagePath', () => {
	it('names a file in a pnpm store folder by package name, version and subpath, not by the store folder', () => {
		const { storeDir, install } = pnpmApp();
		install('1.0.0');

		expect(toPackagePath(path.join(storeDir('1.0.0'), 'css', 'style.css'))).toBe('some-lib@1.0.0/css/style.css');
	});

	it('skips a nested package.json without a name and keeps the scope of a scoped package', () => {
		const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-package-path-')));
		roots.push(root);
		const packageDir = path.join(root, 'node_modules', '@scope', 'kit');
		write(path.join(packageDir, 'package.json'), JSON.stringify({ name: '@scope/kit' }));
		write(path.join(packageDir, 'dist', 'esm', 'package.json'), JSON.stringify({ type: 'module' }));
		const file = write(path.join(packageDir, 'dist', 'esm', 'theme.css'), '.kit {}');

		expect(toPackagePath(file)).toBe('@scope/kit/dist/esm/theme.css');
	});
});

describe('resolvePackagePath', () => {
	it('finds the file in the package installed now after a version bump moves its store folder', () => {
		const { root, storeDir, install } = pnpmApp();
		install('1.0.0');
		const packagePath = toPackagePath(path.join(storeDir('1.0.0'), 'css', 'style.css'))!;
		expect(resolvePackagePath(root, packagePath)).toBe(path.join(storeDir('1.0.0'), 'css', 'style.css'));

		unlinkSync(path.join(root, 'node_modules', 'some-lib'));
		renameSync(
			path.join(root, 'node_modules', '.pnpm', 'some-lib@1.0.0'),
			path.join(root, 'node_modules', '.pnpm', 'gone'),
		);
		install('2.0.0');

		expect(resolvePackagePath(root, packagePath)).toBe(path.join(storeDir('2.0.0'), 'css', 'style.css'));
	});

	it('looks in the node_modules of each folder above the app root', () => {
		const { root, storeDir, install } = pnpmApp();
		install('1.0.0');
		const appDir = path.join(root, 'apps', 'web');
		mkdirSync(appDir, { recursive: true });

		expect(resolvePackagePath(appDir, 'some-lib/css/style.css')).toBe(
			path.join(storeDir('1.0.0'), 'css', 'style.css'),
		);
	});

	it('returns the path under the app node_modules when no folder holds the package', () => {
		const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-package-path-')));
		roots.push(root);

		expect(resolvePackagePath(root, '@scope/kit/theme.css')).toBe(
			path.join(root, 'node_modules', '@scope', 'kit', 'theme.css'),
		);
	});
});
