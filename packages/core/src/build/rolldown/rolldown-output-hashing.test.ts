import { describe, expect, it } from 'vitest';
import type { RolldownOutput } from 'rolldown';
import { buildResultFromRolldownOutput } from './rolldown-adapter-helpers.ts';

function asset(fileName: string, names: string[]) {
	return { type: 'asset', fileName, names, originalFileNames: [], source: '', needsCodeReference: false };
}

function chunk(fileName: string, isEntry: boolean) {
	return { type: 'chunk', fileName, isEntry, imports: [], dynamicImports: [], code: '', modules: {} };
}

describe('buildResultFromRolldownOutput content hashing', () => {
	it('marks only outputs whose name carries a hash', () => {
		const output = {
			output: [
				chunk('page.js', true),
				asset('page.js.map', []),
				chunk('shared-DlXqs-Dv.js', false),
				asset('shared-DlXqs-Dv.js.map', []),
				asset('logo-BZcw_Can.svg', ['logo.svg']),
				asset('fixed/robots.txt', []),
			],
		} as unknown as RolldownOutput;

		const result = buildResultFromRolldownOutput(output, '/out', '/out', { entrypoints: {} }, [], '[name].js');
		const hashedByName = Object.fromEntries(
			result.outputs.map((entry) => [entry.path.replace('/out/', ''), entry.contentHashed]),
		);

		expect(hashedByName).toEqual({
			'page.js': false,
			'page.js.map': false,
			'shared-DlXqs-Dv.js': true,
			'shared-DlXqs-Dv.js.map': true,
			'logo-BZcw_Can.svg': true,
			'fixed/robots.txt': false,
		});
	});
});
