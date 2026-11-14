import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanForeignJsxReach } from './foreign-jsx-reach.ts';

const roots: string[] = [];

function setup(files: Record<string, string>) {
	const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-foreign-reach-')));
	roots.push(root);
	mkdirSync(path.join(root, 'src'));
	for (const [name, content] of Object.entries(files)) writeFileSync(path.join(root, 'src', name), content, 'utf-8');
	const file = (name: string) => path.join(root, 'src', name);
	const reach = (entry: string) =>
		scanForeignJsxReach({
			projectRoot: root,
			reactEntryFiles: new Set([file(entry)]),
			otherEntryFiles: [],
			isForeignFile: (filePath) => filePath === file('card.kitchen.tsx'),
		}).react;
	return { file, reach };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('scanForeignJsxReach', () => {
	it('ignores specifiers written in comments and strings', () => {
		const { reach } = setup({
			'page.tsx': [
				"// import './card.kitchen'",
				"/* export { x } from './card.kitchen' */",
				'export const note = "import x from \'./card.kitchen\'";',
				'export const tpl = `import("./card.kitchen")`;',
			].join('\n'),
			'card.kitchen.tsx': 'export const Card = () => null;',
		});
		expect([...reach('page.tsx')]).toEqual([]);
	});

	it('follows static imports, re-exports and literal dynamic imports', () => {
		for (const line of [
			"import { Card } from './card.kitchen';",
			"export { Card } from './card.kitchen';",
			"export const load = () => import('./card.kitchen');",
		]) {
			const { file, reach } = setup({
				'page.tsx': line,
				'card.kitchen.tsx': 'export const Card = () => null;',
			});
			expect([...reach('page.tsx')]).toEqual([file('card.kitchen.tsx')]);
		}
	});

	it('follows the imports of an MDX file', () => {
		const { file, reach } = setup({
			'page.tsx': "import Doc from './doc.mdx';\nexport default Doc;",
			'doc.mdx': "import { Card } from './card.kitchen';\n\n# Title\n\n<Card />\n",
			'card.kitchen.tsx': 'export const Card = () => null;',
		});
		expect([...reach('page.tsx')]).toEqual([file('card.kitchen.tsx')]);
	});
});
