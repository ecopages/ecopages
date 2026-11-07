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

	it('matches a root-relative path, as emitted modules name their sources', () => {
		expect(matchProductionModuleKey('/deploy', 'src/pages/hello.script.ts', modules)).toBe(
			'src/pages/hello.script.ts',
		);
	});

	it('does not match a path of the build machine by its suffix', () => {
		expect(
			matchProductionModuleKey('/deploy', '/build-machine/app/src/pages/hello.script.ts', modules),
		).toBeUndefined();
	});

	it('returns undefined when no recorded key matches', () => {
		expect(matchProductionModuleKey('/deploy', '/build-machine/app/src/pages/missing.ts', modules)).toBeUndefined();
	});
});
