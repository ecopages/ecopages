import { describe, expect, it } from 'vitest';
import { matchProductionModuleKey } from './server-modules-manifest.ts';

const modules = {
	'src/pages/hello.script.ts': 'hello.mjs',
	'src/pages/lit.lit.tsx': 'lit.mjs',
	'hello.script.ts': 'collision.mjs',
};

describe('matchProductionModuleKey', () => {
	it('returns the root-relative key when the file is under rootDir', () => {
		expect(matchProductionModuleKey('/deploy', '/deploy/src/pages/lit.lit.tsx', modules)).toBe(
			'src/pages/lit.lit.tsx',
		);
	});

	it('matches the longest recorded key that is a suffix of a path outside rootDir', () => {
		expect(matchProductionModuleKey('/deploy', '/build-machine/app/src/pages/hello.script.ts', modules)).toBe(
			'src/pages/hello.script.ts',
		);
	});

	it('returns undefined when no recorded key matches', () => {
		expect(matchProductionModuleKey('/deploy', '/build-machine/app/src/pages/missing.ts', modules)).toBeUndefined();
	});
});
