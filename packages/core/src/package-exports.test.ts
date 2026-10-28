import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const corePackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
	exports: Record<string, unknown>;
};

describe('@ecopages/core package exports', () => {
	it('publishes the selected role entries and runtime-loaded entries only', () => {
		expect(Object.keys(corePackage.exports).sort()).toEqual(
			[
				'.',
				'./build',
				'./build/contracts',
				'./client',
				'./config',
				'./config/write-types',
				'./create-app',
				'./declarations',
				'./env',
				'./errors',
				'./hmr/client/hmr-runtime',
				'./integration',
				'./processor',
				'./view-reference',
			].sort(),
		);
	});
});
