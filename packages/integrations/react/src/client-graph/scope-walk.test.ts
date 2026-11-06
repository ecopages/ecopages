import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';
import { walkScopedReferences } from './scope-walk.ts';

function freeReferences(source: string): string[] {
	const { program } = parseSync('module.tsx', source);
	const names = new Set<string>();
	for (const statement of program.body) {
		walkScopedReferences(statement, { onReference: (name) => names.add(name) });
	}
	return [...names].sort();
}

describe('walkScopedReferences', () => {
	it.each([
		[
			'destructured parameters',
			'const f = ({ db, x = fallback }, [y], ...rest) => [db, x, y, rest];',
			['fallback'],
		],
		[
			'destructured locals',
			'function f(source) { const { db, [key]: alias } = source; return [db, alias]; }',
			['key'],
		],
		[
			'class member names',
			'class R extends Base { db() { return this.db; } static cache = db; #secret = 1; }',
			['Base', 'db'],
		],
		['labels', 'outer: for (const item of items) { if (item) break outer; }', ['items']],
		['catch parameters', 'try { run(); } catch ({ message }) { log(message); }', ['log', 'run']],
		[
			'hoisted var and function declarations',
			'function f() { if (a) { var v = 1; } return [v, g()]; function g() {} }',
			['a'],
		],
		['block-scoped declarations', '{ const inner = 1; } inner;', ['inner']],
		['member names and object keys', 'const value = source.db + { db: 1 }.db;', ['source']],
		[
			'type-only syntax',
			'type T = Secret; interface I { s: Secret } const v: Secret = value as Secret satisfies T;',
			['value'],
		],
		['non-null assertions', 'const v = maybe!;', ['maybe']],
		[
			'JSX component names',
			'const v = <Secret.Provider value={state}><div /><item.Child /></Secret.Provider>;',
			['Secret', 'item', 'state'],
		],
		['shadowing in one scope only', 'const g = (user) => user.name; export const current = user;', ['user']],
		['export specifiers', 'export { local as renamed };', ['local']],
		['assignment targets', '({ db } = source);', ['db', 'source']],
		['meta properties', 'const url = import.meta.url;', []],
	])('reports only free runtime references for %s', (_case, source, expected) => {
		expect(freeReferences(source)).toEqual(expected);
	});

	it('skips a subtree the visitor handles', () => {
		const { program } = parseSync('module.ts', 'export default page({ keep: a, skip: b });');
		const names: string[] = [];
		walkScopedReferences(program.body[0], {
			onReference: (name) => names.push(name),
			onNode: (node) => node.type === 'Property' && node.key.name === 'skip',
		});
		expect(names).toEqual(['page', 'a']);
	});
});
