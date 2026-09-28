import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { frameworkVersion } from './framework-version';

test('frameworkVersion matches the published CLI package', () => {
	const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
	const cliJson = JSON.parse(readFileSync(join(repoRoot, 'packages/ecopages/package.json'), 'utf8')) as {
		version: string;
	};
	expect(frameworkVersion).toBe(cliJson.version);
});
