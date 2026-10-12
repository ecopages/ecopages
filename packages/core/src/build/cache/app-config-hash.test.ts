import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { hashAppConfigFile } from './app-config-hash.ts';

describe('hashAppConfigFile', () => {
	it('changes the config hash when a file eco.config.ts imports changes', () => {
		const configRoot = mkdtempSync(path.join(tmpdir(), 'eco-config-hash-'));
		try {
			const configPath = path.join(configRoot, 'eco.config.ts');
			const optionsPath = path.join(configRoot, 'options.ts');
			writeFileSync(configPath, "import { options } from './options';\nexport default { options };\n");
			writeFileSync(optionsPath, 'export const options = { a: 1 };\n');
			const appConfig = {
				absolutePaths: { config: configPath, configModuleFiles: [configPath, optionsPath] },
			} as unknown as EcoPagesAppConfig;

			const before = hashAppConfigFile(appConfig);
			writeFileSync(optionsPath, 'export const options = { a: 2 };\n');

			expect(hashAppConfigFile(appConfig)).not.toBe(before);
		} finally {
			rmSync(configRoot, { recursive: true, force: true });
		}
	});

	it('returns missing when eco.config.ts is unavailable', () => {
		assert.equal(hashAppConfigFile({ absolutePaths: {} } as unknown as EcoPagesAppConfig), 'missing');
	});
});
