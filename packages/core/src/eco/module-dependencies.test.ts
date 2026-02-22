import { describe, expect, test } from 'vitest';
import { normalizeModuleDeclarations, parseModuleDeclaration } from './module-dependencies.ts';

describe('module dependencies parser', () => {
	test('parses simple module declaration', () => {
		expect(parseModuleDeclaration('react-aria-components')).toEqual({
			from: 'react-aria-components',
		});
	});

	test('parses declaration with named imports', () => {
		expect(parseModuleDeclaration('react-aria-components{Table,Select}')).toEqual({
			from: 'react-aria-components',
			imports: ['Table', 'Select'],
		});
	});

	test('normalizes and deduplicates module declarations', () => {
		expect(
			normalizeModuleDeclarations([
				'react-aria-components{Table,Select}',
				'react-aria-components{Table,Select}',
				'lodash-es{debounce}',
			]),
		).toEqual([
			{ from: 'react-aria-components', imports: ['Table', 'Select'] },
			{ from: 'lodash-es', imports: ['debounce'] },
		]);
	});
});
