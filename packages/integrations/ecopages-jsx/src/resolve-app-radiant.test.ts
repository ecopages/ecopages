import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppRadiantModule } from './resolve-app-radiant.ts';

describe('resolveAppRadiantModule', () => {
	it('uses the Radiant package installed for the app directory', () => {
		const root = mkdtempSync(path.join(os.tmpdir(), 'eco-app-radiant-'));
		const packageDir = path.join(root, 'node_modules/@ecopages/radiant');
		mkdirSync(path.join(packageDir, 'client'), { recursive: true });
		writeFileSync(
			path.join(packageDir, 'package.json'),
			JSON.stringify({
				exports: {
					'./client/install-hydrator': { import: './client/install-hydrator.js' },
				},
			}),
		);
		writeFileSync(path.join(packageDir, 'client/install-hydrator.js'), '');

		try {
			expect(resolveAppRadiantModule('client/install-hydrator', root)).toBe(
				path.join(packageDir, 'client/install-hydrator.js'),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
