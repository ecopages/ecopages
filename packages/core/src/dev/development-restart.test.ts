import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { resolveDevelopmentRecoveryWatch } from './development-restart.ts';

test('watches the project and linked packages, skipping dependencies and build output', () => {
	const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-dev-recovery-')));
	const root = path.join(workspace, 'app');
	const linkedPackage = path.join(workspace, 'linked-ui');
	try {
		mkdirSync(path.join(root, 'node_modules'), { recursive: true });
		mkdirSync(linkedPackage, { recursive: true });
		writeFileSync(path.join(linkedPackage, 'package.json'), JSON.stringify({ name: 'linked-ui' }));
		writeFileSync(
			path.join(root, 'package.json'),
			JSON.stringify({ dependencies: { 'linked-ui': 'workspace:*' } }),
		);
		symlinkSync(linkedPackage, path.join(root, 'node_modules', 'linked-ui'), 'dir');

		const { paths, ignored } = resolveDevelopmentRecoveryWatch(root);

		expect(paths).toEqual([root, linkedPackage]);
		for (const skipped of ['node_modules/dep/index.js', '.git/HEAD', '.eco/cache.json', 'dist/index.html']) {
			expect(ignored(path.join(root, skipped))).toBe(true);
		}
		expect(ignored(path.join(linkedPackage, '.turbo', 'log'))).toBe(true);
		expect(ignored(path.join(root, 'src', 'lib', 'options.ts'))).toBe(false);
		expect(ignored(path.join(root, 'eco.config.ts'))).toBe(false);
		expect(ignored(path.join(linkedPackage, 'src', 'button.ts'))).toBe(false);
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
});
